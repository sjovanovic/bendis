import express from 'express'
import { Server } from 'http'
import { fileURLToPath } from 'url'
import path from 'path'
import {existsSync} from 'fs'


/**
 * Dev server
 */

// Settings
const NAME = process.env.npm_package_name || 'bendis'
const PORT = process.env.PORT || parseInt(process.env.npm_package_config_port || 3030)
const BASE_URL = process.env.NODE_ENV == 'production' ? (process.env.npm_package_config_url || `http://localhost:${PORT}`) : `http://localhost:${PORT}`


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
const SCRIPT_DIR = getProjectRoot() //cfileURLToPath(path.dirname(import.meta.url))
const config = {NAME, PORT, BASE_URL, SCRIPT_DIR}
let app, server;
//let DIST_PATH = path.join(SCRIPT_DIR, '../dist')
let DIST_PATH = path.join(SCRIPT_DIR, './dist')

export const init = (initConf)=>{

    if(initConf) {
        if(typeof initConf == 'string') {
            DIST_PATH = initConf
        }else{
            if(initConf.distPath) DIST_PATH = initConf.distPath
        }
    }
   
    app = express()
    if(initConf && initConf.serverCallback){
        server = initConf.serverCallback(app)
    }else{
        server = Server(app)
    }
    
    let staticServe = express.static(DIST_PATH)
    if(initConf && initConf.callback){
        initConf.callback(server, app)
    }

    app.use((req, res, next)=>{
        // 404s to index
        let allow = ['.css', '.svg', '.js', '.ttf', '.woff', '.woff2', '.png', '.jpg', '.jpeg', '.gif', '.json', '.html']
        if(initConf && initConf.allowExtensions && Array.isArray(initConf.allowExtensions)) {
            initConf.allowExtensions.forEach((ext)=>{
                if(!allow.includes(ext)) allow.push(ext)
            })
        }
        let isIndex = true
        for(let i=0; i<allow.length; i++){
            if(req.url.endsWith(allow[i])) isIndex = false
        }
        if(isIndex) {
            return res.sendFile(`${DIST_PATH}/index.html`);
        }
        next()
    })

    app.use((req, res, next)=>{
        return staticServe(req, res, next)
    })


    return { server, app, staticServe}
}

export const start = () => {
    // starting the http server
    server.listen(PORT, function(){
        console.log(`The ${NAME} development server is running on ${BASE_URL} serving from ${DIST_PATH} directory.`)
    });
}

export default {init, start, config}


