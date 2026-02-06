export default class DataWatcher extends HTMLElement {

    // constructor(data){
    //   super()
    //   this.data = data || {}
    // }

    set data(object){
        this.object = object
        let inst = this
        this._data = this.createDeepProxy(this.object, {
            set(target, path, value, receiver, meta) {
                let detail = { target, path, value, receiver, operation:'set', oldValue: meta.oldValue}
                let proceed = inst.dispatchEvent(new CustomEvent('data-change', { detail, bubbles:true, composed:true, cancelable: true}))
                if(!proceed) return
            },
            deleteProperty(target, path, meta) {
                let detail = { target, path, undefined, operation:'delete', oldValue: meta.oldValue}
                let proceed = inst.dispatchEvent(new CustomEvent('data-change', { detail, bubbles:true, composed:true, cancelable: true}))
                if(!proceed) return
            }
        })
    }

    get data(){
        return this._data
    }

    setValueByPath(path, value) {
        let obj = this.object
        let prop = path.pop()
        let parent = this.deepFind(obj, path)
        value = typeof value == 'object' ? JSON.parse(JSON.stringify(value)) : value
        if(parent) parent[prop] = value
    }
    deleteValueByPath(path) {
      let obj = this.object
      let prop = path.pop()
      let parent = this.deepFind(obj, path)
      if(parent) delete parent[prop]
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

    /**
     * Debounse object sync with a callback afterwards
     * @param {Function} cb 
     */
    dataSync(cb){
      clearTimeout(this._dsyn)
      this._dsyn = setTimeout(()=>{
        this.syncObjects(this._data, this.object)
        if(cb) cb(detail)
      }, 100)
    }

    /**
     * Merge two objects while:
     * - at the end both objects have same properties and values
     * - obj1 takes precedence
     * - not sharing any references
     * - updating only what's changed
     * @param {Object} obj1 
     * @param {Object} obj2 
     */
    syncObjects(obj1, obj2){
      if(obj1 === obj2) return
      let obj1Keys = Object.keys(obj1)
      let obj2Keys = Object.keys(obj2)

      // delete from obj2 those keys that re in the obj2 keys but missing in the obj1 keys
      obj2Keys.filter(k => !obj1Keys.includes(k)).forEach(k => delete obj2[k])

      // for non object values, write to obj2 if they differ with obj1, for objects call recursive
      let obj1Array = Array.isArray(obj1)
      if(obj1Array) obj2.length = 0
      for(let prop in obj1){
        if (typeof obj1[prop] == 'object') {
          if(Array.isArray(obj1[prop])){
            obj2[prop] = []
            this.syncObjects(obj1[prop], obj2[prop])
          }else{
            if(!obj2[prop]) obj2[prop] = {}
            if(typeof obj2[prop] != 'object') obj2[prop] = {}
            this.syncObjects(obj1[prop], obj2[prop])
          }
        }else {
          if(obj2[prop] != obj1[prop]) {
            obj2[prop] = obj1[prop]
          }
        }
      }
    }

    createDeepProxy(target, handler) {
        const preproxy = new WeakMap();
      
        function makeHandler(path) {
          return {
            set(target, key, value, receiver) {
              if (value && value != null && typeof value === 'object') {
                value = proxify(value, [...path, key]);
              }
              let oldValue = target[key]
              if(oldValue === value) return true

              target[key] = value;
      
              if (handler.set) {
                handler.set(target, [...path, key], value, receiver, {oldValue});
              }
              return true;
            },
      
            deleteProperty(target, key) {
              if (Reflect.has(target, key)) {
                let oldValue = target[key]
                unproxy(target, key);

                let isObject = typeof target[key] == 'object'
                let isArray = isObject ? Array.isArray(target[key]) : false

                let deleted = Reflect.deleteProperty(target, key);
                if (deleted && handler.deleteProperty) {
                  handler.deleteProperty(target, [...path, key], {isObject, isArray, oldValue});
                }
                return deleted;
              }
              return false;
            }
          }
        }
      
        function unproxy(obj, key) {
          if (preproxy.has(obj[key])) {
            // console.log('unproxy',key);
            obj[key] = preproxy.get(obj[key]);
            preproxy.delete(obj[key]);
          }
      
          for (let k of Object.keys(obj[key])) {
            if (obj[key][k] != null && typeof obj[key][k] === 'object') {
              unproxy(obj[key], k);
            }
          }
      
        }
      
        function proxify(obj, path) {
          for (let key of Object.keys(obj)) {
            if (obj[key] && obj[key] != null && typeof obj[key] === 'object') {
              obj[key] = proxify(obj[key], [...path, key]);
            }
          }
          let p = new Proxy(obj, makeHandler(path));
          preproxy.set(p, obj);
          return p;
        }

        if (target && target != null && typeof target === 'object') {
          return proxify(target, []);
        }else{
          return proxify({}, []);
        }
    }
}
try{
  customElements.define('data-watcher', DataWatcher)
}catch(err){}
