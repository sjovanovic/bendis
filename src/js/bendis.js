
import DataWatcher from './datawatcher.js'

export default class Bendis extends HTMLElement {

    constructor(data, opts={}){
        super()
        this.opts = {
            pfx:'bnd',
            ...opts
        }
        this.watcher = new DataWatcher(data)
        this.shadow = this.attachShadow({ mode: 'open' })
        this.view = this.shadowRoot
    }

    set state(data){ this.watcher.data = data }
    get state(){ return this.watcher.data }

    watch(path, callback, eventOpts, opts={}) {
        path = this.normalizePath(path)

        let obj = this.state

        let cb = (ev)=>{
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

    defaultCallback(path, element, opts){
        let cb = (ctx)=>{
            let {el, val, prop} = ctx

            if(typeof val == 'object') return // only use default callback on simple types

            let elName = el.nodeName.toLowerCase(), formInputs = ['input', 'select', 'textarea', 'button']
            let hprop = formInputs.includes(elName) ? 'value' : 'innerHTML'
            if (el.type == 'checkbox') {
                el.checked = val
                ctx.addEventListener('change', (ev) => {
                    ctx.obj[prop] = ev.currentTarget.checked
                })
            } else {
                el[hprop] = val
                ctx.addEventListener('input', (ev) => (ctx.obj[prop] = ev.currentTarget.value))
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
        if(!element) throw Error(`Element with selector ${selector} not found.`)
        let ancestors = this.getAncestors(element)
        let binding = {path, spath, selector, callback, opts, isArray, hasArray, bindId, arrayBinding, element, defaultCallback, opts, ancestors}
        this.allBindings[spath].push(binding)

        // handle array
        if(arrayBinding){
            let arrPath = path.slice(0, path.length-1)
            this.watch(arrPath, (ctx)=>{
                if(ctx.operation == 'delete' || !ctx.val || !ctx.val.length){
                    // clear items
                    if(ctx.oldValue && Array.isArray(ctx.oldValue)) {
                        ctx.oldValue.splice(0)
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
        let apath = path.join('.')
        //console.log(`___________________${operation} ${apath}___________________`)

        let bindings = this.allBindings[spath], binding
        if(bindings){
            for(let j=0;j<bindings.length; j++){
                binding = bindings[j]
                // set arrTest.* arrTest.3 .TestArray
                //console.log(`${ctx.operation} ${spath} ${path.join('.')} ${binding.selector}`)
                let el = null
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
                        el = binding.element.cloneNode(true)
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
                            console.log('Element not found at', apath)
                            continue
                        }
                    }
                }
                if(!el) {
                    //console.log('Element Not found')
                    continue
                }
                binding.callback({
                    ...ctx, origPath: path, el, element:el, root: this.state, obj:ctx.target, val: ctx.value, 
                    defaultCallback: function(){
                        binding.defaultCallback(this)
                    },
                    addEventListener: function(name, cb, opts){
                        let evtId = binding.bindId + '_' + name + '_' + this.path.join('.')
                        if(!this.el.__boundEvts || !this.el.__boundEvts[evtId]){
                            if(!this.el.__boundEvts) this.el.__boundEvts = {}
                            if(!this.el.__boundEvts[evtId]) {
                                this.el.__boundEvts[evtId] = true
                                this.el.addEventListener(name, cb, opts)
                            }
                        }
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
        //let spath = watchedPath.join('.')
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

                        if(i == path.length-1){
                            if(!elem.matches(binding.selector)){
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

    getBoundElement_old(path, watchedPath, binding, resultsCallback){
        let fidx = watchedPath.indexOf('*')
        let lidx = watchedPath.lastIndexOf('*')
        let count = path[lidx]/1


        let spath = watchedPath.join('.')

        let cp = [], scp = '', arrCnts = [], arrIdxs = [], nextIdxs = [], prevIdxs = [], ancestors, lastAncestorBinding = null, lastAncestorCount = 0, ancestorBindings = []
        if(fidx != lidx){
            watchedPath.forEach((p, i) => p == '*' ? (arrCnts.push(path[i]) && arrIdxs.push(i)) : null) // get the indexes of arrays
            arrCnts.pop() // pop the last one, it's already counted
            nextIdxs.push(arrIdxs.pop())

            // prev
            if(arrIdxs.length > 1) {
                prevIdxs.push(arrIdxs[arrIdxs.length-1])
            }

            arrCnts = arrCnts.map(p=>p/1)
            let l = arrCnts.length-1
            // decrease the one before 
            if(arrCnts[l] == 0){
                arrCnts.pop() // no need to count this one either since it's the first
            }else{
                arrCnts[l] = arrCnts[l] - 1
            }

            //console.log('arrCnts', arrCnts, 'arrIdxs', arrIdxs)

            // arrCnts [2] arrIdxs [1]
            // arrTest.3.sub.1.name 5


            for(let i=0;i<arrIdxs.length; i++){
                cp = watchedPath.slice(0, arrIdxs[i]+1)
                scp = cp.join('.')

                
                

                let bs = this.allBindings[scp]
                if(bs){ // bindings exists at this path
                    if(!ancestors) ancestors = this.getAncestors(binding.element)
                    let ancestorBinding = bs.find(b => {
                        if(ancestors.includes(b.element)){
                            return true
                        }
                    })
                    if(ancestorBinding) { // ancestor binding exists for
                        lastAncestorBinding = ancestorBinding
                        ancestorBindings.push(ancestorBinding)


                        

                        for(let j=0; j<=arrCnts[i]; j++){
                            cp = path.slice(0, arrIdxs[i])
                            //console.log('Find A length of', cp.join('.'))

                            cp.push(j+'')

                            


                            
                            cp.push(...path.slice(cp.length, nextIdxs[i]))
                            scp = cp.join('.')
                            //console.log('Find length of', scp)

                            let len = this.deepFind(this.state, cp).length

                            
                            

                            count += len
                        }

                        

                    }
                }
            }
        }

       
        // get the element


        let elements = this.view.querySelectorAll(`${binding.selector}`)
        let el = elements[count]

        if(resultsCallback) {
            resultsCallback({elements, index:count})
        }

        // if(!el) {


            

        //     if(parentCallback){


                


        //         // element not found, find the parent node instead
        //         let previousNode = null 

        //         let prev = results[count-1]

        //         if(prev) {
        //             previousNode = prev
        //         }else{
        //             binding.element
        //         }
                



        //         // let parentIdx = 0
        //         // ancestorBindings.forEach(b => {
        //         //     let ancIdx = b.path.lastIndexOf('*')
        //         //     parentIdx += path[ancIdx]/1
        //         // })

        //         // let ancIdx = path.lastIndexOf('*')
        //         // if(ancIdx != -1){
        //         //     parentIdx += path[ancIdx]/1
        //         // }
                

        //         // if(lastAncestorBinding){
        //         //     let lastAncestor = this.view.querySelectorAll(`${lastAncestorBinding.selector}`)[parentIdx]
        //         //     if(lastAncestor){
        //         //         parentNode = lastAncestor.querySelector(binding.selector).parentNode
        //         //     }
        //         // }else{
        //         //     parentNode = binding.element.parentNode
        //         // }
                




        //         // if(lastAncestorBinding){

                    
        //         //     let aresults = this.view.querySelectorAll(`${lastAncestorBinding.selector}`)


        //         //     let parentIdx = 0
        //         //     ancestorBindings.forEach(b => {
        //         //         let ancIdx = b.path.lastIndexOf('*')
        //         //         parentIdx += path[ancIdx]/1
        //         //     })
        //         //     let lastAncestor = this.view.querySelectorAll(`${lastAncestorBinding.selector}`)[parentIdx]
        //         //     if(lastAncestor){
        //         //         parentNode = lastAncestor.querySelector(binding.selector).parentNode
        //         //     }



        //         //     // let lastAncestor = this.view.querySelectorAll(`${lastAncestorBinding.selector}`)[lastAncestorCount]
        //         //     // if(lastAncestor){
        //         //     //     parentNode = lastAncestor.querySelector(binding.selector).parentNode
        //         //     // }
                    
                    
        //         // }else{
        //         //     parentNode = binding.element.parentNode
        //         // }


        //         if(parentNode) {
        //             parentCallback(parentNode)
        //         }

                
        //         if(spath.startsWith('arrTest.*')){

        //             console.log(path.join('.'), parentIdx)
        //         }
                
        //     }

        //     // let spath = watchedPath.join('.')
        //     // if(spath.startsWith('arrTest.*')){

                

        //     //     if(lastAncestorBinding){
        //     //         console.log(path.join('.'), lastAncestorBinding.selector, lastAncestorCount, this.view.querySelectorAll(`${lastAncestorBinding.selector}`)[lastAncestorCount])
        //     //     }else{
        //     //         console.log(path.join('.'), null, lastAncestorCount, binding.element.parentNode)
        //     //     }
    
        //     //     //console.log(spath, lastAncestorCount, count)
                
        //     // }
        // }

        return el
    }

    getAncestors(el){
        let ancestors = []
        //console.log('Getting ancestors for', el)
        //el = el.parentNode;
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

    bind_old(path, selector, callback, opts={}){
        // normalize path
        path = this.normalizePath(path)
        let spath = path.join('.')

        // default calback

        let arrayBinding = false
        if(callback === Array){
            arrayBinding = true
        }

        let defaultCallback = this.defaultCallback(path, null, opts)
        let hasUserCallback = true
        if(!callback) {
            hasUserCallback = false
            callback = defaultCallback
        }

        let bindId = 'b'+Math.random().toString().substring(12)
        let isArray = path[path.length-1] == '*'

        // add binding
        if(!this.bindings) this.bindings = {}
        if(!this.bindings[spath]) this.bindings[spath] = []
        let binding = {path, spath, selector, callback, opts, isArray, bindId, arrayBinding}
        this.bindings[spath].push(binding)

        // if(isArray) {
        //     // watch the set/delete of the array itself
        //     this.watch(path.slice(0, path.length-1), (ctx)=>{
        //         console.log('ARRAY CHANGE', ctx.operation, ctx)
        //         if(ctx.operation == 'delete'){
        //             // make sure that dom is cleared

        //         }
        //     }, {changesOnly:true})
        // }

        let cb = (ctx)=>{
            let {path, watchedPath, operation, obj, val} = ctx
            if(path[path.length-1] == 'length' && Array.isArray(obj) ) return // ignore setting the array length

            let cpath = [], element = null, lastLength = -1, elementMap = {}, elements = []

            for(let i=0;i<watchedPath.length; i++){
                let k = watchedPath[i]
                cpath.push(k)
                if(k == '*') {
                    // get selectors at this point and verify if i-th selector exist
                    let spath = cpath.join('.')
                    let bindings = this.bindings[spath]
                    
                    if(bindings){
                        let index = path[i]/1
                        lastLength = cpath.length
                        for(let j=0;j<bindings.length; j++){
                            let binding = bindings[j]
                            if(!binding.arrayBinding) continue
                            let elems = (element || this.view).querySelectorAll(binding.selector)
                            if(!binding.template && elems[0]) {
                                binding.template = elems[0].cloneNode(true)
                                binding.templateParent = elems[0].parentNode
                            }
                            if(elems[index]) {
                                if(typeof val == 'object') {
                                    element = binding.template.cloneNode(true)
                                    elems[index].replaceWith(element)
                                }else{
                                    element = elems[index]
                                }
                            }else{
                                if(binding.template) {
                                    element = binding.template.cloneNode(true)
                                    let referenceNode = elems[elems.length - 1]
                                    if(referenceNode) {
                                        referenceNode.parentNode.insertBefore(element, referenceNode.nextSibling)
                                    }else{
                                        binding.templateParent.appendChild(element)
                                    }
                                }
                            }
                            elementMap[binding.selector] = element
                            elements.push(element)
                        }
                    }
                }
            }

            let bindings = this.bindings[spath]
            if(bindings){

                //if(spath == 'items.*') console.log('binding', binding, 'elementMap', elementMap)
                
                // get index of the target element
                let elIndex = 0
                path.forEach((p, i) => {
                    if(p == '*') {
                        elIndex = elIndex + watchedPath[i]/1
                    }
                })

                for(let j=0;j<bindings.length; j++){
                    let binding = bindings[j]

                    let element = undefined
                    // if(binding.arrayBinding) {
                        element = elementMap[binding.selector] || elements[elements.length-1]
                        if(!element) element = this.view.querySelector(binding.selector)
                        if(!element) continue
                        if(lastLength >= 0 && lastLength < path.length) {
                            element = element.querySelector(binding.selector)
                        }
                    // }else{
                    //     element = this.view.querySelectorAll(binding.selector)[elIndex]
                    // }
                    if(!element) continue

                    
                    if(operation == 'delete') {
                        element.parentNode.removeChild(element)
                        continue
                    }

                    

                    callback({
                        ...ctx, origPath: path, el: element, element, root: this.state, obj:ctx.target, val: ctx.value, 
                        defaultCallback: function(){
                            defaultCallback(this)
                        },
                        addEventListener: function(name, cb, opts){
                            let evtId = bindId + '_' + name + '_' + this.path.join('.')
                            if(!this.el.__boundEvts || !this.el.__boundEvts[evtId]){
                                if(!this.el.__boundEvts) this.el.__boundEvts = {}
                                if(!this.el.__boundEvts[evtId]) {
                                    this.el.__boundEvts[evtId] = true
                                    this.el.addEventListener(name, cb, opts)
                                }
                            }
                        }
                    })
                }

                // trigger changes for next level of keys if value is object
                if(typeof val == 'object') {
                    let isArray = Array.isArray(val)
                    if(!isArray){
                        let keys = Object.keys(val)
                        for(let i=0; i<keys.length; i++){
                            let key = keys[i]
                            let apath = spath + '.' + key
                            if(this.bindings[apath]) {
                                let detail = {
                                    target: ctx.target[ctx.prop],
                                    path: [...ctx.path, key], 
                                    value: ctx.val[key], 
                                    receiver: ctx.receiver[ctx.prop], 
                                    operation:'set', 
                                    oldValue: (ctx && ctx.oldValue && ctx.oldValue[key] != undefined) ? ctx.oldValue[key] : undefined
                                }
                                this.watcher.dispatchEvent(new CustomEvent('data-change', { detail, bubbles:true, composed:true}))
                            }
                        }
                    }else{
                        //console.log('Its array.')
                    }
                }
            }
        }

        this.watch(path, cb, opts)
    }
}