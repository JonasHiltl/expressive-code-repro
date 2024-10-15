import { createHighlighterCore, isSpecialLang, type HighlighterCore, type ThemeRegistration } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import type { LanguageInput as ShikiLanguageInput, SpecialLanguage, LanguageRegistration as ShikiLanguageRegistration, MaybeGetter, MaybeArray } from 'shiki/core'
import { ExpressiveCodeTheme, getStableObjectHash } from '@expressive-code/core'
import type { StyleVariant } from '@expressive-code/core'

// Unfortunately, the types exported by `vscode-textmate` that are used by Shiki
// don't match the actual grammar requirements & parsing logic in some aspects.
// The types defined here attempt to reduce the amount of incorrect type errors
// that would otherwise when importing and adding external grammars.
type Optional<T, K extends keyof T> = Omit<T, K> & Pick<Partial<T>, K>
type IRawRepository = Optional<ShikiLanguageRegistration['repository'], '$self' | '$base'>
export interface LanguageRegistration extends Omit<ShikiLanguageRegistration, 'repository'> {
    repository?: IRawRepository | undefined
}
export type LanguageInput = MaybeGetter<MaybeArray<LanguageRegistration>>

const highlighterPromiseByConfig = new Map<string, Promise<HighlighterCore>>()
const promisesByHighlighter = new WeakMap<HighlighterCore, Map<string, Promise<unknown>>>()
// We store theme cache keys by style variant arrays because style variant arrays are unique per engine,
// and we can be confident that the same theme object used by the same engine has the same contents
const themeCacheKeysByStyleVariants = new WeakMap<StyleVariant[], WeakMap<ExpressiveCodeTheme, string>>()

/**
 * Gets a cached Shiki highlighter instance for the given configuration.
 */
export async function getCachedHighlighter(config: { langs?: LanguageInput[] | undefined } = {}): Promise<HighlighterCore> {
    const configCacheKey = getStableObjectHash(config)
    let highlighterPromise = highlighterPromiseByConfig.get(configCacheKey)
    if (highlighterPromise === undefined) {
        const langs: ShikiLanguageInput[] = []
        if (config.langs?.length) {
            langs.push(...(config.langs as ShikiLanguageInput[]))
        }
        highlighterPromise = createHighlighterCore({
            themes: [
                import('shiki/themes/github-dark.mjs'),
                import('shiki/themes/github-light.mjs')
            ],
            langs: [
                import('shiki/langs/javascript.mjs'),
                import('shiki/langs/yaml.mjs'),
                import('shiki/langs/go.mjs'),
                import('shiki/langs/sh.mjs'),
            ],
            engine: createOnigurumaEngine(import('shiki/wasm'))
        })
        highlighterPromiseByConfig.set(configCacheKey, highlighterPromise)
    }
    return highlighterPromise
}

export async function ensureThemeIsLoaded(highlighter: HighlighterCore, theme: ExpressiveCodeTheme, styleVariants: StyleVariant[]) {
    // Unfortunately, Shiki caches themes by name, so we need to ensure that the theme name changes
    // whenever the theme contents change by appending a content hash
    let themeCacheKeys = themeCacheKeysByStyleVariants.get(styleVariants)
    if (!themeCacheKeys) {
        themeCacheKeys = new WeakMap<ExpressiveCodeTheme, string>()
        themeCacheKeysByStyleVariants.set(styleVariants, themeCacheKeys)
    }
    const existingCacheKey = themeCacheKeys.get(theme)
    const cacheKey = existingCacheKey ?? `${theme.name}-${getStableObjectHash({ bg: theme.bg, fg: theme.fg, settings: theme.settings })}`
    if (!existingCacheKey) themeCacheKeys.set(theme, cacheKey)

    // Only load the theme if it hasn't been loaded yet
    if (!highlighter.getLoadedThemes().includes(cacheKey)) {
        // Load the theme or wait for an existing load task to finish
        await memoizeHighlighterTask(highlighter, `loadTheme:${cacheKey}`, () => {
            const themeUsingCacheKey = { ...theme, name: cacheKey, settings: (theme.settings as ThemeRegistration['settings']) ?? [] }
            return highlighter.loadTheme(themeUsingCacheKey)
        })
    }
    return cacheKey
}

export async function ensureLanguageIsLoaded(highlighter: HighlighterCore, language: string) {
    const loadedLanguages = new Set(highlighter.getLoadedLanguages())
    const isLoaded = loadedLanguages.has(language)
    const isSpecial = isSpecialLang(language)
    // If the language is not available, fall back to "txt"
    const isAvailable = isLoaded || isSpecial
    if (!isAvailable) return 'txt'
    if (isLoaded || isSpecial) return language
    // Load the language or wait for an existing load task to finish
    const loadedLanguage = await memoizeHighlighterTask(highlighter, `loadLanguage:${language}`, async () => {
        await highlighter.loadLanguage(language as ShikiLanguageInput | SpecialLanguage)
        return language
    })
    return loadedLanguage
}

/**
 * Memoizes a task by ID for a given highlighter instance.
 *
 * This is necessary because SSGs can process multiple pages in parallel and we don't want to
 * start the same async task multiple times, but instead return the same promise for all calls
 * to improve performance and reduce memory usage.
 */
function memoizeHighlighterTask<T>(highlighter: HighlighterCore, taskId: string, taskFn: () => Promise<T>) {
    let promises = promisesByHighlighter.get(highlighter)
    if (!promises) {
        promises = new Map()
        promisesByHighlighter.set(highlighter, promises)
    }
    let promise = promises.get(taskId)
    if (promise === undefined) {
        promise = taskFn()
        promises.set(taskId, promise)
    }
    return promise as Promise<T>
}