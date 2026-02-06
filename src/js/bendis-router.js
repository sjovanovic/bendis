export default class BendisRouter extends HTMLElement {
    constructor(componentPrefix) {
      super()
      this.isRouter = true
      this.shadow = this.attachShadow({ mode: 'open' })
      this.componentPrefix = componentPrefix || 'bendis-'
      this.controllerPrefix = ''
      this.controllerSuffix = 'Controller'
      this.appNodeName = this.componentPrefix + 'app'
      this.runRoute = false
      this.isLoaded = false

      this.app = this

      // overflow history push state to monitor routing
      window.history.pushState = new Proxy(window.history.pushState, {
        apply: (target, thisArg, argArray) => {
          let path = this.getPath(argArray[2])
          if(this.isPathRoute(path) && !this.getPath().endsWith(path)) this.doRoute(path)
          return target.apply(thisArg, argArray);
        },
      });
      // listen to back / forward / go page changes
      window.addEventListener('popstate', (event) => {
        let path = document.location.pathname
        if(this.isPathRoute(path, this.getAttribute('route'))) this.doRoute()
      });

    }

    getAppNode(){
        let node = this
        for(let i=0;i<50;i++){
            node = node.parentNode || node.host
            if(!node) return this
            node = node.host ? node.host : node
            if(!node) return this
            if(node.nodeName.toLowerCase() == this.appNodeName) return node
        }
    }

    isPathRoute(path, route){
        if(!path) path = this.getPath()
        if(!route) route = this.getAttribute('route')
        if(route.includes('{') && route.includes('}')){
            let pparts = path.split('/')
            let parts = route.split('/')
            if(pparts.length < parts.length) return false
            if(pparts.length > parts.length) pparts.splice(0, pparts.length - parts.length) // trim to size
            let regexes = parts.map(p=>{
                if(p.startsWith('{') && p.endsWith('}')){
                    return /.+/
                }else{
                    return new RegExp(p.replace(/[^a-zA-Z0-9]+/g, '.'))
                }
            })
            for(let i=0;i<parts.length;i++){
                if(!pparts[i].match(regexes[i])) return false
            }
            return true
        }else{
            return path.endsWith(route)
        }
    }
    get controllerName(){
        let name = this.getAttribute('route').split('/')
            .map(p => p.startsWith('{') && p.endsWith('}') ? '' : p.replace(/[^a-zA-Z0-9]+/g, ''))//.map(p => p.startsWith('{') && p.endsWith('}') ? p.substring(1, p.length-1).replace(/[^a-zA-Z0-9]+/g, '') : p.replace(/[^a-zA-Z0-9]+/g, ''))
            .map(p => p ? p[0].toUpperCase() + p.substring(1) : '')
            .join('')
        name = this.controllerPrefix + (name || 'Index') + this.controllerSuffix
        return name
    }
    get urlParams(){
        return this.parseURLParams()
    }

    parseURLParams(usePath){
        let params = {}
        let path = usePath || this.getPath()
        let route = this.getAttribute('route')
        if(route.includes('{') && route.includes('}')){
            let pparts = path.split('/')
            let parts = route.split('/')
            if(pparts.length < parts.length) return false
            if(pparts.length > parts.length) pparts.splice(0, pparts.length - parts.length) // trim to size
            parts.forEach((p, i)=>{
                if(p.startsWith('{') && p.endsWith('}')){
                    let name = p.substring(1, p.length-1).replace(/[^a-zA-Z0-9]+/g, '')
                    params[name] = pparts[i]
                }
            })
        }
        return params
    }

    connectedCallback() {
        this.app = this.getAppNode()
        if(this.app != this) { 
            if(this.app.hasAttribute('component-prefix')) this.componentPrefix = this.app.getAttribute('component-prefix')
            if(this.isPathRoute()) {
                this.doRoute()
            }
        }else{
            // route once all siblings are added to DOM
            var observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    clearTimeout(this.tout)
                    this.tout = setTimeout(()=>{
                        this.isLoaded = true
                        if(this.runRoute){
                            this.runRoute = false
                            this.boundParentName = this.parentNode.nodeName.toLowerCase()
                            this.doRoute()
                        }
                    }, 100)
                }
                })
            })
            observer.observe(this, { childList: true })
        }
    }
    static get observedAttributes() {
      return ['route']
    }
    attributeChangedCallback(name, oldValue, value) {
      if(name == 'route'){
        let path = window.location.pathname
        if(value != oldValue && path.endsWith(value)) {
            if(!this.isLoaded) {
                this.runRoute = true
            }else{
                this.doRoute()
            }
        }
      }
    }

    getPath(url){
      try{
        return new URL(url || window.location.href).pathname
      }catch(err){
        if(url.startsWith('./')) {
            url = `${window.location.pathname}${url.substring(2)}`
        }
        return new URL(window.location.protocol + '//' + window.location.hostname + ':' + window.location.port + url).pathname
      }
    }

    doRoute(usePath){

        let prefix = this.componentPrefix

        let view = this.app && this.app.view ? this.app.view : this.parentNode
        let routedNodes = view.querySelectorAll('[routed]')


        // find all prefixed nodes
        let sourceList = []
        this.childNodes.forEach(el=>{
          let nn =  el.nodeName.toLowerCase()
          if(nn.startsWith(prefix)){
            sourceList.push(nn)
          }
        })

        let destList = []
        routedNodes.forEach(el=>{
          let nn = el.nodeName.toLowerCase()
          if(nn.startsWith(prefix)){
            destList.push(nn)
          }
        })

        // copy from sourceList only what's not in destList already
        let toCopy = sourceList.filter(s=>!destList.includes(s))

        // keep what's both in sourceList and destList
        let toKeep = sourceList.filter(s=>destList.includes(s))
        if(!toKeep.includes(prefix + 'route')) toKeep.push(prefix + 'route')

        // remove what's not in toKeep
        let toRemove = []
        routedNodes.forEach(el=>{
            let nn = el.nodeName.toLowerCase()
            if(!toKeep.includes(nn)) toRemove.push(el)
        })
        toRemove.forEach(el=>el.parentNode.removeChild(el))
        // copy
        this.childNodes.forEach(el=>{
          if(toCopy.includes(el.nodeName.toLowerCase())) {
            let clone = el.cloneNode(true)
            clone.setAttribute('routed', true)
            // inject app and router
            clone.router = this
            clone.app = clone.router.app
            // add clone
            let parent = this.parentNode
            if(clone.hasAttribute("parent-selector") && this.app && this.app.view){
                parent = this.app.view.querySelector(clone.getAttribute("parent-selector")) || this.parentNode
            }
            parent.appendChild(clone)

            this.dispatchEvent(new CustomEvent('element-appended', {
                detail: {
                  element: clone
                }, 
                bubbles:true, 
                composed:true
            }))

          }
        })
        
        // emit change route event
        this.runControllers((controller)=>{
            this.dispatchEvent(new CustomEvent('before-route', {
                detail: {
                  path: this.getAttribute('route'),
                  controller
                }, 
                bubbles:true, 
                composed:true
            }))
        }, (controller)=>{
            this.dispatchEvent(new CustomEvent('route', {
                detail: {
                  path: this.getAttribute('route'),
                  controller
                }, 
                bubbles:true, 
                composed:true
            }))
        }, usePath)
    }

    runControllers(before, after, path){
        if(!before) before = function(){}
        if(!after) after = function(){}
        // prepare controllers
        let commonName = this.controllerPrefix + 'CommonController'
        let commonInst = commonName + 'Instance'
        let commonClass = window[commonName]
        let commonController = window[commonInst]
        let cn = this.controllerName
        
        if(!commonController && commonClass){
            window[commonInst] = commonController = new window[commonName](this.app)
        }else if(!commonController) {
            window[commonInst] = commonController = {}
        }
        if(!commonController.controllers) commonController.controllers = {}
        let params = path ? this.parseURLParams(path) : this.urlParams
        let currentController = commonController.controllers[cn]
        if(!currentController) {
            currentController = commonController.controllers[cn] = window[cn] ? new window[cn](this.app, this, params) : {}
            currentController.controllerName = cn
            currentController.app = this.app
            currentController.router = this
        }
        currentController.params = params

        
        // trigger them
        if(this.isPathRoute(path)){
            this.app.router = this
            before(currentController)
            commonController.app = this.app
            commonController.router = this
            if(commonController.onRoute) commonController.onRoute(path)
            if(commonController.currentController){
                if(commonController.currentController.onRouteDestroy) commonController.currentController.onRouteDestroy(currentController)
            }
            commonController.currentController = currentController
            if(currentController.onRoute) currentController.onRoute(path)
            after(currentController)
        }
    }

    navigateTo(destPath, data={}){
        // get base path
        history.pushState({page: '' + destPath, ...data}, '', destPath + window.location.search )
    }

  }
  try{
    customElements.define('bendis-route', BendisRouter);
  }catch(err){}