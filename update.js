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
    const headStyleEl = $('head style').html()
    const bodyStyleEl = $('body style').html()
    const elementStyles = [headStyleEl, bodyStyleEl]
    const styles = {}

    elementStyles
        .filter(style => !['', null, undefined].includes(style))
        .map(style => css.parse(style).stylesheet.rules)
        .flat()
        .forEach(style => {
            if (style == null) return
            const { type, selectors, declarations } = style
            if (type !== 'rule') return
            const decs = declarations.map(({ property, value }) => ({
                string: property ? `${property}: ${value};` : '',
                object: property ? { [property]: value } : {}
            }))
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
 * @param {{ $: cheerio.CheerioAPI, styleObj: { string: String, object: Object}}} args
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
        styleStr += ` ${property}: ${updatedStylesObj[property]};`
        return styleStr
    }, '').trim()
}

async function outputHTML(htmlString) {
    const prettierConfig = await prettier.resolveConfig('./.prettierrc.js')
    const outputPath =
        (argv['o'] || argv['output']) ||
        (argv['t'] || argv['template'])
    fse.outputFileSync(
        outputPath,
        prettier.format(
            htmlString.trim(), { ...prettierConfig, parser: 'html' }
        ),
        (err) => {
            if (err) throw err;
            return
        }
    )
}