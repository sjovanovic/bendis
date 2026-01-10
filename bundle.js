#!/usr/bin/env node
import esbuild from 'esbuild'
import chokidar from 'chokidar'
import htmlMinifier from 'html-minifier-terser'
import path, { basename } from 'path'
import { readFileSync, existsSync, promises as fs, mkdirSync, writeFileSync, cpSync, readdirSync} from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import util from 'node:util';
import { exec } from 'child_process'

import server from './src/server/index.js'

import fetch from 'node-fetch';
import * as GoogleFonts from 'google-fonts-helper'
import jsdom from "jsdom"

const execAsync = util.promisify(exec);


// CHANGE TO MATCH YOUR PROJECT
const NAME = process.env.npm_package_name || 'bendis' // package name
const VERSION = process.env.npm_package_version || '0.1.0'
let PREFIX = process.env.npm_package_config_prefix || 'bds' // prefix for all the web components (change to something short and relevant to your project)
const PAGE_SELECTOR = 'MainContent'

const BENDIS_CONF = {
  download_fonts: false, // download fonts from google fonts during production build
  html_only: false, // when true produce only one HTML file with JavaScript included in script tag
  sub_path: process.env.SUB_PATH ? process.env.SUB_PATH : '/'
}

let RELOAD_SCRIPT
const { minify } = htmlMinifier
let IS_PRODUCTION = process.env.NODE_ENV === 'production'
//const ROOT_PATH = dirname(fileURLToPath(import.meta.url))


const getProjectRoot = (fileName) => {
  if(!fileName) fileName = 'package.json'
  let dir = process.cwd(), fdir = dir
  let pts = dir.split(path.sep)
  for(let i=0; i<pts.length; i++){
    let file = path.join(dir, fileName)
    if(existsSync(file)) {
      return dir
    }else if(existsSync(dir)){
      dir = path.normalize(path.join(dir, '..'))
    }else{
      break
    }
  }
  return fdir
}
const ROOT_PATH = getProjectRoot()


// settings
// let SETTINGS = {}
// if(process.env.SETTINGS) {
//   if(existsSync(process.env.SETTINGS)) {
//     SETTINGS = JSON.parse(path.normalize(path.join(ROOT_PATH, readFileSync(process.env.SETTINGS))))
//   }
// }



// const SCRIPTS_PATH = join(ROOT_PATH, 'scripts')
const SRC_PATH = join(ROOT_PATH, 'src')
const ASSETS_PATH = join(SRC_PATH, 'assets')
const DIST_PATH = join(ROOT_PATH, 'dist')
const HTML_PATH = join(DIST_PATH, 'index.html')
const ENTRY_PATH = join(ROOT_PATH, 'src/index.js')

const TEMPLATE_PATH = join(SRC_PATH, 'html')
const OUT_NAME = NAME + '-' + VERSION + '.js'
const OUT_PATH = join(DIST_PATH, OUT_NAME)

// if (process.platform === 'win32') {
//   // WIN has multiple arguments so spawn would need to be handled differently in the build function
//   // spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', join(SCRIPT_PATH, 'reload.win.ps1')])
//   RELOAD_SCRIPT = `powershell -ExecutionPolicy Bypass -File ${join(SCRIPTS_PATH, 'reload.win.ps1')}`
// } else if (process.platform === 'darwin') {
//   RELOAD_SCRIPT = join(SCRIPTS_PATH, 'reload.apple.sh')
// }


/*

Make sure the directory structure is ok.
The directory structure:
src
  assets
    fonts
  html
  js
dist

*/
const initializeFilesystem = () => {

  let shouldCreateProject = false
  if (!existsSync(SRC_PATH)) {
    mkdirSync(SRC_PATH)
    shouldCreateProject = true
  }

  if (!existsSync(ENTRY_PATH)) {
    writeFileSync(ENTRY_PATH, `// components` + "\n\n" + `// controllers`, 'utf-8');
  }

  let jsPath  = join(SRC_PATH, 'js')
  if (!existsSync(jsPath)) {
    mkdirSync(jsPath)
  }

  if(shouldCreateProject) createApplication(NAME, PREFIX)
}

const htmlPlugin = {
  name: 'html',
  setup(build) {
    build.onResolve({ filter: /\?html$/ }, (args) => {
      return {
        path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
        namespace: 'html-loader'
      }
    })
    build.onLoad({ filter: /\?html$/, namespace: 'html-loader' }, async (args) => {
      const pth = args.path.replace(/\?html$/, '')
      const dir = dirname(pth)
      let contents = await fs.readFile(pth, 'utf-8')
      // Inline all the linked css files - TODO: add postcss parser here
      contents = contents.replace(/<link\s+rel="stylesheet"\s+href="(.*?)">/gs, function (tag, cssFilename) {
        let cssFileContent = ''
        try {
          cssFileContent = `<style>\n${readFileSync(join(dir, cssFilename))}\n</style>`
        } catch (e) {
          console.error(`File ${pth} contains relation to non existing style ${cssFilename}!`)
        }
        return cssFileContent
      })
      // Inline all the raw files (<raw href="path" />) - they can be anything, from svg to simple html partials
      contents = contents.replace(/<raw\s+href="(.*?)" \/>/gs, function (tag, rawFilename) {
        let rawFileContent = ''
        try {
          rawFileContent = readFileSync(join(dir, rawFilename))
        } catch (e) {
          console.error(`File ${pth} contains raw tag relation to non existing style ${rawFilename}!`)
        }
        return rawFileContent
      })
      // Extract convert and build svg symbols from <icon> tags
      const icons = []
      contents = contents.replace(/<svg-icon\s+href="(.*?)" \/>/gs, function (tag, svgFilename) {
        let name
        let width
        let height
        try {
          name = basename(svgFilename)
          let content = readFileSync(join(dir, svgFilename), 'utf-8')
          content = content.replace(/<svg(.*?)viewBox="(.*?)"(.*?)>(.*)<\/svg>/gs, (tag, pre, viewBox, post, svg) => {
            const attrs = pre + post
            width = attrs.match(/.*?width="(\d+)".*?/)
            height = attrs.match(/.*?height="(\d+)".*?/)
            return `<symbol id="${name}" viewBox="${viewBox}">${svg}</symbol>`
          })
          if (!icons.find(({ name: n }) => name === n)) {
            icons.push({ name, content })
          }
        } catch (e) {
          console.error(`File ${pth} contains svg-icon tag relation to non existing style ${svgFilename}!`)
        }
        // Extract width / height from svg file
        const size = `${width ? ` width="${width[1]}"` : ''}${height ? ` height="${height[1]}"` : ''}`
        return `<svg class="svg-icon"${size}><use xlink:href="#${name}" /></svg>`
      })
      if(icons.length) contents = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
        width="0" height="0" style="display:none;">${icons.map(({ content }) => content).join('')}</svg>${contents}`

      if (IS_PRODUCTION) {
        contents = minify(contents, {
          minifyCSS: true,
          collapseWhitespace: true,
          removeComments: true,
          removeAttributeQuotes: true,
          removeEmptyAttributes: true,
        })
      }

      return {
        contents,
        loader: 'text',
      }
    })
  },
}

const rawPlugin = {
  name: 'raw',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      return {
        path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
        namespace: 'raw-loader',
      }
    })
    build.onLoad({ filter: /\?raw$/, namespace: 'raw-loader' }, async (args) => {
      return {
        contents: await fs.readFile(args.path.replace(/\?raw$/, ''), 'utf-8'),
        loader: 'text',
      }
    })
  },
}

/**
 * Build the code
 */
const build = async (customEntryPath) => {

  initializeFilesystem()

  if(customEntryPath && !Array.isArray(customEntryPath)) customEntryPath = [customEntryPath]
  try {
    // Get time before build starts
    const timerStart = Date.now()

    // Build code
    const out = await esbuild.build({
      plugins: [htmlPlugin, rawPlugin],
      color: true,
      entryPoints: customEntryPath || [ENTRY_PATH],
      minify: IS_PRODUCTION,
      bundle: true,
      write: false,
      sourcemap: IS_PRODUCTION ? false : 'inline',
      // platform: 'node',
      platform: 'browser',
      logLevel: 'error',
      outdir: ' '
    })

    // Make sure dist folder exists
    if (!existsSync(DIST_PATH)) {
      await fs.mkdir(DIST_PATH)
    }
    // Make sure assets folder exists
    if (!existsSync(ASSETS_PATH)) {
      await fs.mkdir(ASSETS_PATH)
    }
    // Make sure fonts folder exists
    let fontsPath = join(ASSETS_PATH, 'fonts')
    if (!existsSync(fontsPath)) {
      await fs.mkdir(fontsPath)
    }
    // Make sure html template folder exists
    if (!existsSync(TEMPLATE_PATH)) {
      await fs.mkdir(TEMPLATE_PATH)
    }
    // Make sure index.html exists
    let indexHtml = join(TEMPLATE_PATH, 'index.html')
    if (!existsSync(indexHtml)) {
      await fs.writeFile(indexHtml, `<!DOCTYPE html>
      <html lang="en">
        <head>
          <title>${NAME}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <base href="/" />
          <!-- HEAD -->
          <style>
            html,body {  margin: 0; height:100dvh; width:100dvw; font-family: sans-serif; }
          </style>
        </head>
        <body>
          <!-- BODY -->
          <h1>${NAME}</h1>
        </body>
      </html>`, 'utf8')
    }

    // Make sure js folder exists
    const JS_PATH = join(SRC_PATH, 'js')
    if (!existsSync(JS_PATH)) {
      await fs.mkdir(JS_PATH)
    }

    // copy files
    copyAssetFonts()

    // Read the html template
    let html = await fs.readFile(join(SRC_PATH, 'html', 'index.html'), 'utf-8')

    // download dependencies
    let deps = ''
    if(IS_PRODUCTION){

      // download all dependencies
      console.log(`Downloading dependencies...`)
      deps = await downloadDependencies(html)
      console.log(`Downloaded ${deps.length} dependencies.`)
      deps = deps.join("\n")
      html = cleanDependencies(html)

      if(BENDIS_CONF.download_fonts){
        // download all fonts
        html = await downloadGoogleFonts(html)
        console.log('All fonts downloaded.')
      }
      
    }
    
    // Create build
    let scripts = deps + out.outputFiles.map(({ text }) => text).join("\n")

    if(BENDIS_CONF.html_only){
      html = html.replace('<!-- HEAD -->', `<script>${scripts}</script>`)
    }else {
      await fs.writeFile(OUT_PATH, scripts)
      // Inject compiled source and app custom tag
      let sp = BENDIS_CONF.sub_path
      if(sp != '/'){
        html = html.replace('<!-- HEAD -->', `<script src="${sp}${OUT_NAME}"></script>`)
      }else{
        html = html.replace('<!-- HEAD -->', `<script src="${OUT_NAME}"></script>`)
      }
    }

    // replace <base href="/" /> with <base href="${BENDIS_CONF.sub_path}" />
    html =  html.replace('<base href="/" />', `<base href="${BENDIS_CONF.sub_path}" />`)

    // Get time after build ends
    const timerEnd = Date.now()

    // Write generated html file
    await fs.writeFile(HTML_PATH, html)

    console.log(`Built in ${timerEnd - timerStart}ms. Now reloading...`)

    // Reload
    if (RELOAD_SCRIPT) {
      exec(RELOAD_SCRIPT, (error, stdout, stderr) => {
        if (error) {
          console.log(error.stack)
          console.log('Error code: ' + error.code)
          console.log('Signal received: ' + error.signal)
        }
        // console.log('Child Process STDOUT: '+stdout);
        // console.log('Child Process STDERR: '+stderr);
      })
    }
  } catch (e) {
    console.error(e)
  }
}

const httpServer = async ()=>{
  let serverSetup = null
  let setupPath = path.join(ROOT_PATH, 'serverSetup.js')
  if(existsSync(setupPath)) {
    const setupUrl = pathToFileURL(setupPath).href
    serverSetup = await import(setupUrl)
    serverSetup = serverSetup.default
  }
  try{
    server.init(serverSetup || DIST_PATH)
    server.start()
  }catch(err){
    console.log('Server cannot start.')
    console.error(err)
  }
}

const downloadDependencies = async (html) => {
  let results = []
  let matches = html.match(/\<script\s+src\s*=\s*\"(.+)\"/g)
  if(matches && matches.length) {
    for(let i=0; i<matches.length; i++){
      let m = matches[i]
      let match = m.match(/\<script\s+src\s*=\s*\"(.+)\"/)
      if(match && match.length > 1){
        let uri = match[1]
        if(uri.startsWith('http')) {
          let resp = await fetch(uri)
          results.push(await resp.text())
        }
      }
    }
  }
  return results
}

const cleanDependencies = (html) => {
  let matches = html.match(/\<script\s+src\s*=\s*\"(.+)\".+\<\/script\>/g)
  if(matches && matches.length) {
    matches.forEach(m=>{
      html = html.replace(m, '')
    })
  }
  return html
}

const downloadGoogleFonts = async (html) => {

  // get all google stylesheet hrefs
  // <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@200;300;400;700&display=swap" rel="stylesheet">
  let urls = []
  let matches = html.match(/\<link\s+href\s*=\s*\"(.+)\"\s+.*rel\=\"stylesheet/g)
  if(matches && matches.length) {
    for(let i=0; i<matches.length; i++){
      let m = matches[i]
      let match = m.match(/\<link\s+href\s*=\s*\"(.+)\"\s+.*rel\=\"stylesheet/)
      if(match && match.length > 1){
        let uri = match[1]
        if(uri.startsWith('http') && uri.includes('google') && uri.includes('family=')) {
          urls.push(uri)
        }
      }
    }
  }

  let config = {
    outputDir: join(DIST_PATH, 'fonts'),
    //path:       './',
    overwriting: true,
    fontsDir: 'fonts',
    fontsPath: './fonts',
    base64: false
  }

  let userAgents = {
    woff2: undefined,
    woff: 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0',
    ttf: 'Wget/1.18'
  }
  
  for(let i=0; i<urls.length; i++){
    let url = urls[i]
    console.log('Downloading Google fonts:', url)

    let mainCssFile = `./fonts/fonts${i || ''}.css`
    let promises = []
    let srcFiles = []
    for(let format in userAgents){

      let downloader = GoogleFonts.download(url, {
        ...config,
        stylePath: `fonts_${format}_${i}.css`,
        headers: [['User-Agent', userAgents[format]]]
      })
      promises.push(downloader.execute())

      srcFiles.push(join(config.outputDir, c.cssFile))
    }
    await Promise.all(promises)
    await mergeGoogleFontCss(srcFiles, join(DIST_PATH, mainCssFile))

    html = html.replace(url, mainCssFile)
  }

  // remove the preconnect links
  html = html.replace(/\<link\s+rel\=\"preconnect\".+\>/g, '')

  return html
}

const cssToArr = (css) => {
  css = css.replace(/\/\*.+\*\//g, '')
  let regex = '([^{]+)\s*\{\s*([^}]+)\s*}'
  let all = new RegExp(regex, 'g')
  let one = new RegExp(regex)
  let out = []
  let match = css.match(all)
  if(match && match.length) match.forEach(m=>{
    let groups = m.match(one)
    if(groups && groups.length >= 2) {
      let entry = {
        name: groups[1].trim(),
        values: []
      }
      out.push(entry)
      groups[2].split(';').forEach(s=>{
        let pts = s.split(':')
        if(pts.length == 2){
          entry.values.push({
            name: pts[0].trim(),
            value: pts[1].trim()
          })
        }
      })
    }
  })
  return out
}
const arrToCss = (arr) => {
  let pts = arr.map(e=>{
    return `${e.name} {
      ${e.values.map(v=>`${v.name}: ${v.value};`).join("\n      ")}}`
  })
  return pts.join("\n")
}


const mergeGoogleFontCss = async (inputFiles, outFile) => {

  let out = []

  // algo: merge all @font-face into single file where font-style and font-weight match
  let files = await Promise.all(inputFiles.map(f=>fs.readFile(f, 'utf-8')))
  files.forEach((css, idx)=>{
    let cssArr = cssToArr(css)
    if(idx === 0) {
      out = cssArr
    }else{
      let swMap = {}
      cssArr.filter(e=>e.name == '@font-face').forEach(e=>{
        let fontStyle = e.values.find(v=>v.name == 'font-style')
        let fontWeight = e.values.find(v=>v.name == 'font-weight')
        let src = e.values.find(v=>v.name == 'src')
        if(fontStyle && fontWeight && src) swMap[`${fontStyle.value}_${fontWeight.value}`] = src.value
      })

      out.filter(e=>e.name == '@font-face').forEach(e=>{
        let fontStyle = e.values.find(v=>v.name == 'font-style')
        let fontWeight = e.values.find(v=>v.name == 'font-weight')
        let src = e.values.find(v=>v.name == 'src')
        let srcVal = swMap[`${fontStyle.value}_${fontWeight.value}`]
        if(fontStyle && fontWeight && src && srcVal) src.value = `${src.value}, ${srcVal}`
      })
    }
  })

  await Promise.all(inputFiles.map(f=>fs.unlink(f)))

  //console.log('Writing to', outFile)
  if(out.length) await fs.writeFile(outFile, arrToCss(out))
}

const extractTranslations = async () => {
  let files = await fs.readdir(TEMPLATE_PATH)
  let translations = []
  let skipNodes = ['HTML', 'HEAD', 'BODY', 'LINK', 'META', 'SCRIPT', 'SVG-ICON', 'CANVAS', 'STYLE']
  let attrs = ['hint', 'value', 'placeholder']
  for(let i=0;i<files.length;i++){
    let file = files[i]
    if(!file.endsWith('.html')) continue 
    let path = join(TEMPLATE_PATH, file)
    let contents = await fs.readFile(path, 'utf-8')
    //console.log(path);
    const dom = new jsdom.JSDOM(contents);
    let nodes = dom.window.document.querySelectorAll("*")
    for(let j=0; j<nodes.length; j++){
      let el = nodes[j]
      if(skipNodes.includes(el.nodeName)) continue
      if(el.childNodes){
        el.childNodes.forEach(c=>{
          if(c.nodeName == '#text'){
            addToTranslation(c.textContent, translations)
          }
        })
      }
      attrs.forEach(att=>{
        if(el.hasAttribute(att)){
          addToTranslation(el.getAttribute(att), translations)
        }
      })
    }
  }

  await fs.writeFile(`${ASSETS_PATH}/strings.json`, JSON.stringify({
    version: Date.now(),
    strings: translations
  }, null, 2), 'utf-8')

  console.log(translations)
}

const addToTranslation = (txt, translations)=>{
  txt = txt.replace(/\s+/g, ' ').trim()
  let skip = ['—', '→', ':']
  if(txt && !skip.includes(txt) && !translations.includes(txt)){
    translations.push(txt)
  }
}


const copyAssetFonts = async ()=>{
  let exts = ['ttf', 'woff', 'woff2'], srcDir = join(ASSETS_PATH, 'fonts'), destDir = join(DIST_PATH, 'fonts')
  let files = await fs.readdir(srcDir)
  let fonts = files.filter(f=>exts.filter(e=>f.endsWith(e)).length > 0)
  if(fonts.length && !await existsSync(destDir)) await mkdirSync(destDir);
  let promises = fonts.map(font=>fs.copyFile(join(srcDir, font), join(destDir, font)))
  return Promise.all(promises)
}



const createNewComponent = (name, isIndexPage)=>{

  let prefix = PREFIX.toLowerCase()

  if(!name || !name.trim()) throw Error('Component name is missing')
  name = name.trim()
  let className = `${prefix}-${name}`.split(/[^a-zA-Z0-9]/g).map(n=>n[0].toUpperCase() + (n.length > 1 ? n.substring(1).toLowerCase() : '')).join('')
  if(className[0].match(/[0-9]/)) throw Error('Component name must not start with a number')
  let elementName = prefix + '-' + name.split(/[^a-zA-Z0-9]/g).map(n=>n.toLowerCase()).join('-')


  let baseClass = `${prefix[0].toUpperCase() + prefix.substring(1).toLowerCase()}Base`
  let baseName = `${prefix}-base` //baseClass.toLowerCase()

  let classText = `  import layoutHtml from '../html/${elementName}.html?html'
  import { ${baseClass} } from './${baseName}'

  export class ${className} extends ${baseClass} {
      constructor(state) {
        super()
        this.state = {...state}
        this.view.innerHTML = layoutHtml
      }
  }
  customElements.define('${elementName}', ${className})
  `
  let htmlText = `  <style></style>
  <div class="Base">
    ${elementName}
    ${isIndexPage ? `<div class="${PAGE_SELECTOR}"></div>` : ''}
  </div>
  `

  let jsPath = join(SRC_PATH, 'js', `${elementName}.js`)
  if(!existsSync(jsPath)) {
    writeFileSync(jsPath, classText, "utf8")
  }else{
    console.log(`File ${jsPath} already exists. Skipping.`)
  }
  let htmlPath = join(SRC_PATH, 'html', `${elementName}.html`)
  if(!existsSync(htmlPath)) {
    writeFileSync(htmlPath, htmlText, "utf8")
  }else{
    console.log(`File ${htmlPath} already exists. Skipping.`)
  }

  
  

  includeFilePath(join('js', elementName), '// components')
  console.log('☛ Created web component class', className, 'with HTML tag:', `<${elementName}></${elementName}> in ${jsPath} and HTML template in ${htmlPath}`)

  return elementName
}

const createNewPage = (name)=>{

  let prefix = PREFIX.toLowerCase()

  if(!name || !name.trim()) throw Error('Page path is missing')
  name = name.trim()
  let path = ('/' + name.split(/[^a-zA-Z0-9\{\}]+/g).join('/')).replace(/\/+/g, '/')
  let isIndexPage = path == '/'
  let cleanName = isIndexPage ? 'index' : name.replace(/\{.+\}/g, '').replace(/$[^a-zA-Z0-9]+/g, '').replace(/[^a-zA-Z0-9]+^/g, '')
  let ctrlName = cleanName.split(/[^a-zA-Z0-9]+/g).map(n=>n.toLowerCase()).join('-').replace(/\-+/g, '-')
  if(ctrlName.startsWith('-')) ctrlName = ctrlName.substring(1)
  if(ctrlName.endsWith('-')) ctrlName = ctrlName.substring(0, ctrlName.length-1)
  let elementName = prefix + '-' + ctrlName + '-page'

  // create page component
  createNewComponent(ctrlName + '-page')

  // add route
  let pageContentSelector = '.' + PAGE_SELECTOR
  let routeText = `<${prefix}-route route="${path}">
  <${elementName} parent-selector="${pageContentSelector}"></${elementName}>
  </${prefix}-route>`
  let htmlPath = join(SRC_PATH, 'html', `${prefix}-app.html`)
  if(!existsSync(htmlPath)) throw Error(`The application template ${htmlPath} does not exist. Please create the application first.`)
  let htmlText = readFileSync(htmlPath, 'utf-8')
  if(htmlText.includes(`route="${path}"`)) throw Error("The app already includes path" + path)
  htmlText = htmlText + "\n" + routeText
  writeFileSync(htmlPath, htmlText, "utf8")

  console.log(`☛ Added route ${path} in ${htmlPath}`)

  // create controller
  let ctrlDir = join(SRC_PATH, 'js', 'controllers') 
  if(!existsSync(ctrlDir)) mkdirSync(ctrlDir);
  let ctrlPath = join(SRC_PATH, 'js', 'controllers', `${ctrlName}.js`) 
  let ctrlClass = cleanName.split(/[^a-zA-Z0-9]+/g).map(n=> n ? n[0].toUpperCase() + (n.length > 1 ? n.substring(1).toLowerCase() : '') : n).join('') + 'Controller'
  let ctrlText = `export default class ${ctrlClass} {
      constructor(app, router, params){
      }
      onRoute(){
        console.log('${ctrlClass} onRoute()', this.router.urlParams)
      }
      onRouteDestroy(){
          console.log('${ctrlClass} onRouteDestroy()')
      }
  }
  window.${ctrlClass} = ${ctrlClass}
  `
  if(existsSync(ctrlPath)) throw Error(`File ${ctrlPath} already exists.`)
  
  
  writeFileSync(ctrlPath, ctrlText, "utf8")
  console.log(`☛ Created page controller ${ctrlClass} in ${ctrlPath}`)

  // include controller
  includeFilePath(join('js', 'controllers', ctrlName), '// controllers')
}

const includeFilePath = (includePath, sectionMarker) => {
  if(!existsSync(SRC_PATH)) mkdirSync(SRC_PATH)
  let indexPath = join(SRC_PATH, 'index.js')
  let indexFile = ''
  try{
    indexFile = readFileSync(indexPath, 'utf-8')
  }catch(err){}
  if(!indexFile) indexFile = `// components` + "\n\n" + `// controllers`
  let parts = indexFile.split(sectionMarker)
  if(parts.length) parts[0] = parts[0] + sectionMarker + "\n" + `import './${includePath}'`
  indexFile = parts.join('')
  writeFileSync(indexPath, indexFile, 'utf-8')
}

const createApplication = async (name, prefix)=>{
  let projectDir = ROOT_PATH
  prefix = prefix ? prefix.toLowerCase() : PREFIX.toLowerCase()
  console.log(`☛ About to create application named "${name}" with prefix ${prefix}`)
  let pureName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

  // update package.json
  let pkgPath = join(projectDir, 'package.json')
  let portNew = Math.floor(Math.random() * (9999 - 1001 + 1) + 1001)

  if(existsSync(pkgPath)) {
      let pkg = JSON.parse(readFileSync(pkgPath))
      pkg.name = pureName
      pkg.type = 'module'
      if(!pkg.config) pkg.config = {}
      pkg.config.prefix = prefix
      pkg.config.port = portNew
      pkg.bin = {}
      if(!pkg.scripts) pkg.scripts = {}
      if(!pkg.scripts.dev) pkg.scripts.dev = "npx bendis"
      if(!pkg.scripts.build) pkg.scripts.build = "export NODE_ENV=production || set NODE_ENV=production&& npx bendis --build"
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  }else{
    let pkg = {
      "name": pureName,
      "version": VERSION,
      "description":pureName,
      "main": "index.js",
      "type": "module",
      "scripts": {
        "dev": "npx bendis",
        "build": "export NODE_ENV=production || set NODE_ENV=production&& npx bendis --build",
        "test": "echo \"Error: no test specified\" && exit 1"
      },
      "author": "",
      "license": "ISC",
      "config": {
        "prefix": prefix,
        "port": portNew
      },
      "bin": {}
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  }

  try{
    const { stdout, stderr } = await execAsync(`cd ${projectDir} && npm install bendis@latest --save`)
    //console.log(stdout)
    if(stderr) console.log(stderr)
  }catch(err) {
    console.error(err)
  }

  // make sure src folder exists
  if(!existsSync(SRC_PATH)) mkdirSync(SRC_PATH)

  // make sure js folder exists
  let jsPath = join(SRC_PATH, 'js')
  if(!existsSync(jsPath)) mkdirSync(jsPath)

  // make sure html folder exists
  let hPath = join(SRC_PATH, 'html')
  if(!existsSync(hPath)) mkdirSync(hPath)


  // create router class with prefix
  let routerClass = `${prefix[0].toUpperCase() + prefix.substring(1).toLowerCase()}Router`
  let routerElement = `${prefix}-route`
  let routerText = `import BendisRouter from 'bendis/BendisRouter'
  export class ${routerClass} extends BendisRouter{
      constructor(){
          super('${prefix}-')
      }
  }
  customElements.define('${routerElement}', ${routerClass})`
  let routerPath = join(SRC_PATH, 'js', `${routerElement}.js`) 
  if(existsSync(routerPath)) {
    console.error(`Project Already exists, aborting.`)
    return
  }
  writeFileSync(routerPath, routerText, 'utf-8')
  includeFilePath(join('js', routerElement), '// components')
  console.log(`☛ Created router class ${routerClass} with tag ${routerElement} in ${routerPath}`)

  // create base class
  let baseClass = `${prefix[0].toUpperCase() + prefix.substring(1).toLowerCase()}Base`
  let baseName = `${prefix}-base` //baseClass.toLowerCase()
  let basePath = join(SRC_PATH, 'js', `${baseName}.js`) 
  let baseText = `import Bendis from 'bendis/Bendis'
  export class ${baseClass} extends Bendis {
  }`
  writeFileSync(basePath, baseText, 'utf-8')
  includeFilePath(join('js', baseName), '// components')
  console.log(`☛ Created base class ${baseClass} in ${basePath}`)

  // create app component
  let appElement = createNewComponent('app', true)

  // add the app element to index.html
  let indexPath = join(SRC_PATH, 'html', 'index.html')
  let indexFile = ''
  let sectionMarker = '<!-- BODY -->'
  try{
    indexFile = readFileSync(indexPath, 'utf-8')
  }catch(err){
    console.log(`☛ Creating ${indexPath}`)
    indexFile = `<!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${name}</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <base href="/" />
        <!-- HEAD -->
        <style>
          html,body {  margin: 0; height:100dvh; width:100dvh; font-family: sans-serif;}
        </style>
      </head>
      <body>
        ${sectionMarker}
      </body>
    </html>`
  }
  
  let parts = indexFile.split(sectionMarker)
  if(parts.length) parts[0] = parts[0] + sectionMarker + "\n" + `<${appElement}></${appElement}>`
  indexFile = parts.join('')
  writeFileSync(indexPath, indexFile, 'utf-8')


  // create index page
  createNewPage('/')
}


const buildSpecificFile = async (fileName, distPath) => {
  if(distPath) {
    distPath = path.normalize(path.join(ROOT_PATH, distPath))
    if(!existsSync(distPath)) distPath = null
  }
  console.log({fileName, distPath, out: join(distPath || DIST_PATH, fileName[0].split(path.sep).pop())})
  if(!fileName || !fileName.length) return console.log('File name(s) are missing')
  if(!Array.isArray(fileName)) fileName = fileName.split(',')

  let paths = fileName.map(name => join(ROOT_PATH, `src`, `${name}`))
  await build(paths)
  fs.copyFile(OUT_PATH, join(distPath || DIST_PATH, fileName[0].split(path.sep).pop()))
}

const buildTest = async () => {
  let testsDir = join(ROOT_PATH, `src`, `tests`)
  let mainTestFile = 'tests.js'
  let testComponents = readdirSync(testsDir).filter(f => f != mainTestFile && f.endsWith('.js')).map(f => `<${f.split('.')[0]}-test></${f.split('.')[0]}-test>`)
  let html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <title>bendis tests</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <base href="/" />
      <!-- HEAD -->
      <style>
        html,body {  margin: 0; height:100%; font-family: sans-serif; }
      </style>
      <script src="tests.js"></script>
    </head>
    <body>
      ${testComponents}
    </body>
  </html>`
  let path = join(testsDir, mainTestFile)
  
  await build(path)
  await fs.copyFile(OUT_PATH, join(DIST_PATH, 'tests.js'))
  let destTestPath = join(DIST_PATH, 'tests.html')
  writeFileSync(destTestPath, html)
  console.log(`Tests built in ${destTestPath}`)
}

if(process.argv.includes('--help')){
  console.log('**********')
  console.log('* BENDIS *')
  console.log('**********')
  console.log('BENDIS micro JavaScript framework. Web components + deep proxy + pure HTML = standard simplicity')
  console.log(`When called with no arguments, the command will build the application in the development mode, include source maps, run the app on the development server and re-build whenever there is a change in the source code.`)
  console.log('')
  console.log('--create-application NAME PREFIX           Creates a new application with name NAME and optional prefix PREFIX (short prefix for the web component tags)')
  console.log('--create-page PATH                         Creates a new page with path PATH starting with slash (i.e. /contact). The route, the controller and page web component are created.')
  console.log('--create-component NAME                    New web component is created with name NAME, a html tag will be <PREFIX-NAME/>, also a html template is created in src/html folder.')
  console.log('--build                                    This switch will build the application in production mode and save in the dist fiolder')
  console.log('--html-only                                Builds a single html file in the dist folder which contains the javascript inside the script tag')
  console.log('--download-fonts                           Also download all fonts from Google fonts during production build')
  console.log('--build-file FILE_PATH                     Build specific file or files (comma delimited), by default it builds the entire application.')
  console.log('--dest-path                                Used in conjunction with --build-file, specifies path for the output files, defaults to dist folder.')
  console.log('--translation-strings                      Extracts all text strings for translation and saves them into src/assets/strings.json')
  console.log('--build-test                               Builds test.html in the dist/ directory from src/tests/tests.js')
  process.exit(0)
}

if(process.argv.includes('--html-only')){
  BENDIS_CONF.html_only = true
}else{
  BENDIS_CONF.html_only = false
}

if(process.argv.includes('--download-fonts')){
  BENDIS_CONF.download_fonts = true
}else{
  BENDIS_CONF.download_fonts = false
}

if(process.argv.includes('--build-file')){
  let nameIdx = process.argv.indexOf('--build-file') + 1
  let componentFileName = process.argv[nameIdx]

  let destPath = null
  let dpidx = process.argv.indexOf('--dest-path')
  if(dpidx != -1){
    destPath = process.argv[dpidx + 1]
  }
  buildSpecificFile(componentFileName.split(','), destPath)
}else if(process.argv.includes('--create-project')){
  let nameIdx = process.argv.indexOf('--create-project') + 1
  let name = process.argv[nameIdx]
  let prefix = process.argv[nameIdx + 1] ? process.argv[nameIdx + 1] : PREFIX.toLowerCase()
  PREFIX = prefix

  let pureName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  let projectDir = join('.', pureName)
  cpSync(ROOT_PATH, projectDir, {recursive: true});
  createApplication(name, prefix)
}else if(process.argv.includes('--create-application')){
  let nameIdx = process.argv.indexOf('--create-application') + 1
  let name = process.argv[nameIdx]
  let prefix = process.argv[nameIdx + 1] ? process.argv[nameIdx + 1] : (name.toLowerCase().substring(0, 3) || PREFIX.toLowerCase())
  PREFIX = prefix
  createApplication(name, prefix)
}else if(process.argv.includes('--create-page')){
  let nameIdx = process.argv.indexOf('--create-page') + 1
  let name = process.argv[nameIdx]
  createNewPage(name)
}else if(process.argv.includes('--create-component')){
  let nameIdx = process.argv.indexOf('--create-component') + 1
  let name = process.argv[nameIdx]
  createNewComponent(name)
}else if(process.argv.includes('--translation-strings')){
  extractTranslations()
}else if(process.argv.includes('--build-test')){
  

  const watcher = chokidar.watch([SRC_PATH])
  console.log(`Watching file changes in ${SRC_PATH} ...\n`)
  buildTest().then(_=>httpServer())
  watcher.on('change', () => {
    buildTest()
  })
}else if (!process.argv.includes('--build')) {
  //const watcher = chokidar.watch(['src/**/*'])
  const watcher = chokidar.watch([SRC_PATH])
  console.log(`Watching file changes in ${SRC_PATH} ...\n`)
  build().then(_=>httpServer())
  watcher.on('change', () => {
    build()
  })
} else {
  if (process.argv[1].endsWith('bendis') || import.meta.url.endsWith(process.argv[1])) {
    IS_PRODUCTION = true
    build()
    IS_PRODUCTION = process.env.NODE_ENV === 'production'
  }
  else if(require.main === module) {
    IS_PRODUCTION = true
    build()
    IS_PRODUCTION = process.env.NODE_ENV === 'production'
  }
}

export {createApplication, createNewPage, createNewComponent, server}