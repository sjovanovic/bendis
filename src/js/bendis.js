
import DataWatcher from './datawatcher.js'
import './datawatcher.js'

export default class Bendis extends HTMLElement {

    constructor(data, opts={}){
        super()
        this.opts = {
            pfx:'bnd',
            ...opts
        }
        //this.watcher = new DataWatcher(data)
        this.watcher = document.createElement('data-watcher')
        this.watcher.data = data

        this.shadow = this.attachShadow({ mode: 'open' })
        this.view = this.shadowRoot
    }

    set state(data){ this.watcher.data = data }
    get state(){ return this.watcher.data }

    watch(path, callback, eventOpts, opts={}) {
        path = this.normalizePath(path)

        let obj = this.state

        let cb = (ev)=>{
            setTimeout(()=>{
                let {detail} = ev
                if(detail.path.length != path.length) return

                // match with asterisk
                let mismatch = path.find((p, i) => {
                    if(p == '*') return false
                    if(p != detail.path[i]) return true
                })
                if(!mismatch) {
                    let prop = detail.path[detail.path.length-1]
                    callback({...detail, prop, watchedPath:path, val: detail.value, root: obj, obj:detail.target})
                }
            }, 0)
        }
        // before watching for changes run callback on existing data
        if(!opts.changesOnly){
            let res = this.searchValues(path, true)

            if(res && res.values && res.values.length){
                let receiver = this.deepFind(obj, res.paths[0].slice(0, res.paths[0].length - 1))
                let target = receiver
                res.values.forEach((val, i) => {
                    if(val != undefined) {
                        let actualPath = res.paths[i]
                        let prop = actualPath[actualPath.length-1]
                        let cbobj = {value: val, val, prop, watchedPath:path, path:actualPath, root: obj, obj:target, operation:'set', receiver, target, scope: res }
                        callback(cbobj)
                    }
                })
            }
        }

        this.watcher.addEventListener('data-change', cb, eventOpts)
        
    }

    searchValues(path, withPaths) {
        path = this.normalizePath(path)
        //let stringPath = path.join('.')
        let {object} = this.watcher
        if(!path.find(p => p == '*')){
            if(withPaths){
                return {paths:[path], values:[this.deepFind(object, path)]}
            }else{
                return [this.deepFind(object, path)]
            }
        }
        let paths = this.expandPath(path, object)
        let values = paths.map(p => this.deepFind(object, p))

        // console.log('path', path)
        // console.log('paths', paths)
        if(withPaths){
            return {paths, values}
        }else{
            return values
        }
    }

    expandPath(path, object) {
        // create path tree object
        let nextKey = (path, object)=>{
            let p = path[0], pathTree = {}
            if(p == '*'){
                let keys = Object.keys(object)
                let psliced = path.slice(1)
                keys.forEach(k => {
                    pathTree[k] = nextKey(psliced, object[k])
                })
            }else if(object[p] != undefined){
                let psliced = path.slice(1)
                pathTree[p] = nextKey(psliced, object[p])
            }
            return pathTree
        }
        let tree =  nextKey(path, object)
        let paths = []
        let extractPaths = (tree, path=[])=>{
            let keys = Object.keys(tree)
            if(keys.length) {
                keys.forEach(k => {
                    extractPaths(tree[k], [...path, k])
                })
            }else{
                paths.push(path)
            }
        }
        extractPaths(tree)

        // filter only those which have same path length
        paths = paths.filter(p => p.length == path.length)

        return paths
    }

    normalizePath(path){
        if(Array.isArray(path)) return path
        if(typeof path == 'string') return path.split('.')
    }

    deepFind(obj, paths) {
        let  current = obj, i;
      
        for (i = 0; i < paths.length; ++i) {
          if (current[paths[i]] == undefined) {
            return undefined;
          } else {
            current = current[paths[i]];
          }
        }
        return current;
    }

    copy(obj){
        if(typeof obj != 'object') return obj 
        return JSON.parse(JSON.stringify(obj))
    }

    get formInputs(){
        return ['input', 'select', 'textarea', 'button']
    }

    defaultCallback(path, element, opts){
        let cb = (ctx)=>{
            let {el, val, prop} = ctx

            if(typeof val == 'object') return // only use default callback on simple types

            let elName = el.nodeName.toLowerCase()
            let isFormInput = this.formInputs.includes(elName)
            let hprop = isFormInput ? 'value' : 'innerHTML'
            if (el.type == 'checkbox' || el.type == 'radio') {
                el.checked = val
                ctx.addEventListener('change', (ev) => {
                    ctx.obj[prop] = ev.currentTarget.checked
                })
            } else {
                if(isFormInput || el.hasAttribute('contenteditable')){
                    if(el[hprop] != val) {
                        el[hprop] = val
                    }
                    ctx.addEventListener('input', (ev) => {
                        if(ev.currentTarget[hprop] != ctx.obj[prop]) {
                            ctx.obj[prop] = ev.currentTarget[hprop]
                        }
                    })
                }else{
                    el[hprop] = val
                }
            }
        }
        return cb
    }

    bind(path, selector, callback, opts={}){
        // normalize path
        path = this.normalizePath(path)
        let spath = path.join('.')

        let arrayBinding = false
        if(callback === Array){
            arrayBinding = true
            if(path[path.length-1] != '*'){
                throw Error('When binding arrays, path must end with asterisk "*" character')
            }
            callback = undefined
        }

        // default calback
        let defaultCallback = this.defaultCallback(path, null, opts)
        if(!callback) {
            callback = defaultCallback
        }

        let bindId = 'b'+Math.random().toString().substring(12)
        let isArray = path[path.length-1] == '*'
        let hasArray = path.includes('*')

        // add binding
        if(!this.allBindings) this.allBindings = {}
        if(!this.allBindings[spath]) this.allBindings[spath] = []
        let element = this.view.querySelector(selector)
        if(!element) return // throw Error(`Element with selector ${selector} not found.`)
        let ancestors = this.getAncestors(element)
        let binding = {path, spath, selector, callback, opts, isArray, hasArray, bindId, arrayBinding, element, defaultCallback, opts, ancestors}
        this.allBindings[spath].push(binding)

        // handle array
        if(arrayBinding){
            binding.templateElement = element.cloneNode(true)
            element.style.display = 'none'
            let arrPath = path.slice(0, path.length-1)
            //console.log('arrPath', arrPath)
            this.watch(arrPath, (ctx)=>{
                //console.log('arrPath operation', arrPath, ctx.operation, ctx.path, ctx)
                if(ctx.operation == 'delete' || !ctx.val || !ctx.val.length){
                    // clear items
                    if(ctx.oldValue && Array.isArray(ctx.oldValue)) {
                        ctx.oldValue.splice(0)
                    }else if(ctx.operation == 'set'){
                        // experimental array filling 
                        setTimeout(()=>{
                            let {obj, prop} = ctx
                            let items = JSON.parse(JSON.stringify(obj[prop]))
                            obj[prop].length = 0
                            for(let i=0;i<items.length;i++){
                                obj[prop].push(items[i])
                            }
                        }, 0)
                    }
                }
            }, opts)
        }

        // watch
        this.watch(path, (ctx) => this.handler(ctx), opts)
    }

    handler(ctx){

        let {path, operation, watchedPath, val, obj, prop, opts} = ctx
        let spath = watchedPath.join('.')

        if(path[path.length-1] == 'length' && Array.isArray(obj) ) return

        let bindings = this.allBindings[spath], binding
        if(bindings){
            for(let j=0;j<bindings.length; j++){
                binding = bindings[j]
                let el = null, elIndex = -1
                if(binding.arrayBinding){
                    let previousNode = null
                    el = this.getBoundElement(path, watchedPath, binding, (results)=>{
                        let {elements, index} = results
                        previousNode = elements[index-1]
                    })
                    if(el) {
                        if(operation == 'delete'){
                            if(el == binding.element){
                                binding.element.style.display = 'none'
                            }else{
                                el.parentNode.removeChild(el)
                            }
                            continue
                        }else if(el == binding.element){
                            binding.element.style.display = null
                        }
                    }else{
                        //el = binding.element.cloneNode(true)
                        el = binding.templateElement.cloneNode(true)
                        if(previousNode) {
                            previousNode.parentNode.appendChild(el)
                        }else{
                            binding.element.parentNode.appendChild(el)
                        }
                    }
                }else{
                    if(!binding.hasArray) {
                        el = binding.element
                    }else{
                        el = this.getBoundElement(path, watchedPath, binding)
                        if(!el) {
                            //console.log('Element not found at', apath)
                            if(el && ctx.value === undefined) {
                                el.style.display = 'none'
                            }
                            continue
                        }
                    }
                }
                if(!el || ctx.value === undefined) {
                    //console.log('Element Not found')
                    if(el && ctx.value === undefined) {
                        el.style.display = 'none'
                    }
                    continue
                }

                el.style.display = null

                if(Array.isArray(ctx.target)){
                    elIndex = parseInt(ctx.prop)
                }
                binding.callback({
                    ...ctx, origPath: path, el, element:el, root: this.state, obj:ctx.receiver, val: ctx.value, index: elIndex,
                    defaultCallback: function(){
                        binding.defaultCallback(this)
                    },
                    addEventListener: function(name, cb, opts){
                        let evtId = binding.bindId + '_' + name + '_' + path.join('.')
                        if(!el.__be) el.__be = {}
                        if(el.__be[evtId]) el.removeEventListener(el.__be[evtId].name, el.__be[evtId].cb, el.__be[evtId].opts)
                        el.__be[evtId] = {name, cb, opts}
                        el.addEventListener(name, cb, opts)
                    }
                })
            }
        }
        // trigger changes for next level of keys if value is object
        if(typeof val == 'object' && val != null) {
            let isArray = Array.isArray(val)
            if(!isArray){
                let keys = Object.keys(val)

                for(let i=0; i<keys.length; i++){
                    let key = keys[i]
                    let apath = spath + '.' + key

                    let subArr = Array.isArray(val[key])
                    if(subArr) apath = apath + '.*'
                    if(this.allBindings[apath]) {
                        let newPath = [...ctx.path, key]
                        if(subArr) {
                            for(let i=0; i<val[key].length; i++){
                                let detail = {
                                    target: ctx.target[ctx.prop][key],
                                    path: [...newPath, i+''], 
                                    value: ctx.val[key][i], 
                                    receiver: ctx.receiver[ctx.prop][key], 
                                    operation:'set', 
                                    oldValue: (ctx && ctx.oldValue && ctx.oldValue[key] != undefined && ctx.oldValue[key][i]) ? ctx.oldValue[key][i] : undefined
                                }
                                this.watcher.dispatchEvent(new CustomEvent('data-change', { detail, bubbles:true, composed:true}))
                            }
                        }else{
                            let detail = {
                                target: ctx.target[ctx.prop],
                                path: newPath, 
                                value: ctx.val[key], 
                                receiver: ctx.receiver[ctx.prop], 
                                operation:'set', 
                                oldValue: (ctx && ctx.oldValue && ctx.oldValue[key] != undefined) ? ctx.oldValue[key] : undefined
                            }
                            this.watcher.dispatchEvent(new CustomEvent('data-change', { detail, bubbles:true, composed:true}))
                        }
                        
                    }
                }
            }else{
                //console.log('Its array.')
            }
        }
    }

    getBoundElement(path, watchedPath, binding, resultsCallback=function(){}){
        // go up the path and for each * find the *th sibling of the bound element (if binding exists)
        // if * is at the end return that element, otherwise search for cinding.selector inside the last one

        let p, c, bs, cp=[], scp='', elem = this.view, elements=[], ancestorBinding, parentBound, ancestors

        let hasAsterisk = watchedPath.includes('*')
        if(!hasAsterisk){
            elem = this.view.querySelector(binding.selector)
            elements = elem ? [elem] : []
            resultsCallback({elements, index:0, ancestorBinding, parentBound, ancestors})
            return elem
        }

        for(let i=0;i<path.length; i++){
            c = watchedPath[i]
            cp.push(c)
            p = path[i]
            ancestorBinding = null
            elements = []
            if(c == '*'){
                scp = cp.join('.')
                p = p/1
                bs = this.allBindings[scp]
                if(bs){
                    ancestorBinding = bs.find(b => {
                        if(binding.ancestors.includes(b.element)){
                            return true
                        }
                    })

                    if(ancestorBinding){
                        // console.log(scp, `Find ${p}th element with ${ancestorBinding.selector} inside ${elem.className || elem}`)

                        elements = elem.querySelectorAll(ancestorBinding.selector)
                        let el = elements[p]
                        if(!el) {
                            resultsCallback({elements, index:p, lastBoundAncestorElement:elem})
                            return 
                        }
                        elem = el

                        let matchesSelector = elem.matches(binding.selector)
                        if(i == path.length-1 || (i == path.length-2 && matchesSelector)){
                            if(!matchesSelector){
                                let elCandidate = elem.querySelector(binding.selector)
                                if(elCandidate){
                                    elements = Array.prototype.slice(elements)
                                    elements.push(elCandidate)
                                    elem = elCandidate
                                    resultsCallback({elements, index:p})
                                    return elem
                                }
                            }
                            resultsCallback({elements, index:p})
                            return elem
                        }
                    }
                }
            }
        }
        if(elem){
            elements = elem.querySelectorAll(binding.selector)
            resultsCallback({elements, index:0})
            return elements[0]
        }
    }

    getAncestors(el){
        let ancestors = []
        while (el != this.view) {
            ancestors.unshift(el)
            try{
                el = el.parentNode;
            }catch(er) {
                throw er
            }
        }
        return ancestors;
    }
    getAncestor(selector, limit=20){
        let tmp = this.parentNode
        for(let i=0; i<limit; i++){
          if(!tmp){return}else if(tmp instanceof ShadowRoot && tmp.host) {
            if(tmp.host.matches(selector)){
              return tmp.host
            }else if(tmp){
              tmp = tmp.host.parentNode
            }else{ return }
          }else if(tmp.matches && tmp.matches(selector)) { 
            return tmp
          }else{
            tmp = tmp.parentNode
          } 
        }
    }
    dispatchDescendantEvent(event, selector='*'){
        if(!event) return
        event.preventDefault()
        event.stopPropagation()
        this.view.querySelectorAll(selector || '*').forEach(el => {
            if(customElements.get(el.nodeName.toLowerCase())){
                el.dispatchEvent(event)
            }
        })
    }
}