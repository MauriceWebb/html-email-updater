const fse = require('fs-extra')
const css = require('css');
const cheerio = require('cheerio')
const prettier = require('prettier')
const { v4: uuidv4 } = require('uuid')
const argv = require('minimist')(process.argv.slice(2))
const helperAttr = `data-os-${uuidv4()}`

updateHTML()

async function updateHTML() {
    // 0. verify req args were passed:
    verifyEnvVars()
    // 1. read html file:
    const $ = getHTML()
    // 2. get styles and parse into object:
    const styleObj = styleCssToObj($)
    // 3. loop through body's children and add class styles to element's style tag if not already included:
    const styledHTML = stylizeHTML({ $, styleObj })
    // 4. overwrite original html file:
    await outputHTML(styledHTML)
}

function verifyEnvVars() {
    const missingVars = []
    const requiredVars = [
        'template|t',
    ]

    requiredVars.forEach(reqVars => {
        const [long, short] = reqVars.split('|')
        if (!argv[long] && !argv[short]) {
            missingVars.push(reqVars)
        }
    })

    if (missingVars.length > 0) {
        throw Error(`The following parameters must be provided:\n\t- ${missingVars.join('\n\t- ')}\n`)
    }
}

function getHTML() {
    return cheerio.load(
        fse.readFileSync((argv['t'] || argv['template'])),
        null,
        true
    )
}

/**
 * 
 * @param {cheerio.CheerioAPI} $ 
 */
function styleCssToObj($) {
    const styles = {}
    getAllDocumentRules($)
        .forEach(style => {
            if (style == null) return
            const { type, selectors, declarations } = style
            if (type !== 'rule') return
            const decs = declarations.map(({ property, value }) => {
                return {
                    string: property ? `${property}: ${value};` : '',
                    object: property ? { [property]: value } : {}
                }
            })
            selectors.forEach(selector => {
                if (styles[selector]) {
                    styles[selector] = [
                        ...styles[selector],
                        ...decs
                    ]
                } else {
                    styles[selector] = decs
                }
            })
        })

    return styles
}

/**
 * 
 * @param {cheerio.CheerioAPI} $ 
 */
function getAllDocumentRules($) {
    const headStyleEls = $('head style')
        .toArray().map(el => $(el).html().trim())
    const bodyStyleEls = $('body style')
        .toArray().map(el => $(el).html().trim())
    const elementStyles = [...headStyleEls, ...bodyStyleEls]

    return elementStyles
        .filter(style => !['', null, undefined].includes(style))
        .map(style => css.parse(style).stylesheet.rules)
        .flat()
}

/**
 * 
 * @param {{ 
 *   $: cheerio.CheerioAPI, 
 *   styleObj: { string: String, object: Object}
 * }} args
 */
function stylizeHTML({ $, styleObj }) {
    const updatedEls = []

    // Apply styles in sorted tag-class-id order:
    Object.keys(styleObj)
        .sort().reverse()
        .forEach(selector => {
            const els = $(selector)
            if (els.length === 0) {
                return
            }
            els.each((idx, el) => {
                updatedEls.push(el)
                const elStyleObj = getElStyleObj(el)
                const dataElOrigStyle = JSON.stringify(elStyleObj)
                const proposedStyleObj = getDeclarationsObj(
                    styleObj[selector]
                )

                const updatedStyles = {
                    ...elStyleObj,
                    ...proposedStyleObj,
                }
                const newStyle = getStyleObjString(updatedStyles)
                if (!el.attribs[helperAttr]) {
                    el.attribs[helperAttr] = dataElOrigStyle
                }
                el.attribs.style = newStyle.trim()
            })
        })

    // make sure original style declarations weren't overrided:
    updatedEls.forEach(el => {
        const originalStyles = JSON.parse(el.attribs[helperAttr])
        const currentStyles = getElStyleObj(el)
        const finalStyles = {
            ...currentStyles,
            ...originalStyles
        }

        const finalStyleStr = getStyleObjString(finalStyles)
        el.attribs.style = finalStyleStr.trim()
    })

    // remove helper data-original-styles attribute:
    Array.from($(`[${helperAttr}]`)).forEach(el => {
        delete el.attribs[helperAttr]
    })

    // Update media queries:
    const mediaQueries = updateMediaQueries({ $, rules: getAllDocumentRules($) })

    // ensure style elements are properly placed:
    ensureStyles({ $, styleObj, mediaQueries })

    return $.html()
}

function getElStyleObj(el) {
    const elStyleAttr = el.attribs.style
    const elStyles = elStyleAttr ? elStyleAttr.split(';') : []
    const elStyleObj = elStyles.reduce((obj, style) => {
        const [property, value] = style.split(':')
        if (!property) return obj
        obj[property.trim()] = value.trim()
        return obj
    }, {})
    return elStyleObj
}

function getDeclarationsObj(declarations) {
    return declarations.reduce((obj, { object }) => {
        obj = {
            ...obj,
            ...object
        }
        return obj
    }, {})
}

function getStyleObjString(updatedStylesObj) {
    return Object.keys(updatedStylesObj).reduce((
        styleStr, property
    ) => {
        const prop = property.replace(/[A-Z]/g, match =>
            `-${match.toLowerCase()}`
        )
        styleStr += ` ${prop}: ${updatedStylesObj[property]};`
        return styleStr
    }, '').trim()
}

/**
 * 
 * @param {{ 
 *   $: cheerio.CheerioAPI, 
 *   styleObj: { string: String, object: Object}
 * }} args
 */
function ensureStyles({ $, styleObj, mediaQueries = '' }) {
    if (Object.keys(styleObj).length === 0) {
        return
    }

    // If there is already a head element, check to see if it has a style element. Add one if not:
    const headEls = $('head')
    if (headEls.length > 0) {
        // are there aren't any head styles:
        if ($('head style').length === 0) {
            // add a style element into first head element:
            headEls.first().append('<style>')
        }
    }

    // Update header's first style element to styleObj or create it if not exists. Create second head element and duplicate styleObj into a style element within it:
    const headStyles = $('head style')
    const headStyleStr = '<head><style></style></head>'
    const tmpHead = cheerio.load(headStyleStr)('head')

    if (headStyles.length < 2) {
        // Create 1 or 2 head elements and add styles:
        for (let i = 0; i < (headStyles.length === 0 ? 2 : 1); i++) {
            tmpHead.clone().insertBefore($('body'))
        }
    }

    // Remove any empty head elements:
    $('head').each((idx, el) => {
        if (el.children.length === 0) {
            $(el).remove()
        }
    })

    // Add styles to first two head elements
    const cssStyles = Object.entries(styleObj)
        .map(([s, declarations]) => {
            const d = declarations.reduce((str, { string }) => {
                str += `${string}\n`
                return str
            }, '')
            return `${s} {\n${d}}`
        })
        .join('\n')

    $('head style').each((idx, styleEl) =>
        $(styleEl)
            .empty()
            .html(cssStyles + mediaQueries)
    )

    // Verify that body's first child is a style element and create one if not. Update body's style element to styleObj:
    if ($('body').children().first().prop('name') !== 'style') {
        // first check if there is a style in the body:
        const tmp = $('body style')
        const bodyStyle = tmp.length >= 1 ? tmp.first() : $('<style>')
        bodyStyle.insertBefore($('body').children().first())
    }
    $('body').children().first()
        .empty()
        .html(cssStyles + mediaQueries)

    return
}

/**
 * 
 * @param {{ 
 *   $: cheerio.CheerioAPI, 
 *   rules: []
 * }} args
 */
function updateMediaQueries({ $, rules }) {
    const queries = []
    rules
        .filter(({ type }) => type === 'media')
        .forEach(style => {
            if (style.type === 'media') {
                const mediaRules = style.rules.reduce((str, rule) => {
                    const { type, selectors, declarations } = rule
                    if (type !== 'rule') str
                    const decStr = declarations.map(({ property, value }) => property ? `${property}: ${value};` : '')
                    const validSelectors = []
                    selectors.forEach(selector => {
                        // check if selector exists:
                        if ($(selector).length > 0) {
                            validSelectors.push(selector)
                        }
                    })

                    if (validSelectors.length > 0) {
                        return str += `${validSelectors.join(',\n')} {\n${decStr.join('\n')}\n}`
                    }

                    return str
                }, '')

                if (mediaRules) {
                    const nonApplicableRule = `.NA-${helperAttr.split('data-os-')[1]} {\ncolor: black;\n}\n`
                    const finalMediaRules = nonApplicableRule + mediaRules
                    queries.push(
                        `@media ${style.media} {\n${finalMediaRules}\n}`
                    )
                }
            }
        })
    return queries.join('\n')
}

async function outputHTML(htmlString) {
    const prettierConfig = await prettier.resolveConfig('./.prettierrc.js')
    const outputPath =
        (argv['o'] || argv['output']) ||
        (argv['t'] || argv['template'])
    fse.outputFileSync(
        outputPath,
        prettier.format(
            htmlString.trim().replace(/></g, '>\n<'),
            { ...prettierConfig, parser: 'html' }
        ),
        (err) => {
            if (err) throw err;
            return
        }
    )
}