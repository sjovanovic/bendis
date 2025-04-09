import Bendis from './bendis.js'
import contentHtml from '../html/popup.html?raw'

class NeuPopup extends Bendis {
    constructor(){
        super()
        this.state = {
            open: this.hasAttribute('open'),
            bubble: this.hasAttribute('bubble'),
            gap: this.hasAttribute('gap') ? this.getAttribute('gap').split(' ') : '8'
        }
        this.view.innerHTML = contentHtml
        this.varName = Math.random().toString().substring(2)

        this.watch('open', (ctx)=>{
            let popupBg = this.popupBackground ? this.popupBackground : this.view.querySelector('.PopupBg')
            popupBg.style.display = ctx.val ? null : 'none'
            if(this.state.bubble && ctx.val === true) {
                this.bubblePos()
            }
        })
    }

    async bind(path, element, callback, opts){
        if(!this.container) {
            // buffer the binds for when container is available
            if(!this._bindBuffer) this._bindBuffer = []
            this._bindBuffer.push([path, element, callback, opts])
            //throw Error("Cannot bind until popup is loaded")
            return
        }
        //if(typeof element == 'string') element = this.container.querySelector(element)
        super.bind(path, element, callback, opts)
    }

    attributeChangedCallback(){
        this.state.open = this.hasAttribute('open')
    }

    connectedCallback() {
        clearTimeout(this._loTo)
        this._loTo = setTimeout(() => {
            if(!window[this.varName]) {
                window[this.varName] = document.createElement('div')
                document.body.appendChild(window[this.varName])
            }
            this.container = window[this.varName]
            this.container.style.position = 'absolute'
            this.container.style.left = '0px'
            this.container.style.top = '0px'
            this.view.querySelector('.PopupWindow').innerHTML = this.innerHTML
            this.container.innerHTML = this.view.innerHTML
            this.view.innerHTML = ''
            this.view = this.container
            this.popupWindow = this.container.querySelector('.PopupWindow')
            this.popupBackground = this.container.querySelector('.PopupBg')
            if(this.state.bubble) this.bubblePos()
            this.popupWindow.addEventListener('click', (ev)=>{
                ev.preventDefault()
                ev.stopPropagation()
            })
            this.popupBackground.addEventListener('click', ()=>{
                this.state.open = false
            })
            if(this._bindBuffer) {
                this._bindBuffer.forEach(b => this.bind(...b))
                this._bindBuffer = undefined
            }
            this.dispatchEvent(new CustomEvent('load', {
                detail: { container: this.container, element: this}
            }))
        }, 0)
    }

    set x(x){
        this.popupWindow.style.left = x + 'px'
    }
    set y(y){
        this.popupWindow.style.top = y + 'px'
    }

    set open(open) {
        this.state.open = open
    }
    get open(){
        return this.state.open
    }

    bubblePos(refElement, positionOrder){
        if(!this.container) return
        let bg = this.popupBackground, 
            wi = this.popupWindow,
            bb = wi.getBoundingClientRect(),
            po = (refElement || this).getBoundingClientRect(), 
            ww = document.documentElement.clientWidth, 
            wh = document.documentElement.clientHeight,
            ga = this.state.gap

        ga = Array.isArray(ga) ? ga : [ga, ga, ga, ga] // LTRB
        if(!ga.length == 4) ga = [ga[0], ga[0], ga[0], ga[0]]
        ga = ga.map(n => parseFloat(n))
        let [L, T, R, B] = ga

        bg.style.position = 'absolute'
        bg.style['pointer-events'] = 'all' 
        bg.style['background-color'] = 'transparent'
        bg.style['background'] = 'unset'
        bg.style['backdrop-filter'] = 'unset'

        let {left, top} = po
        let {width, height} = bb
        let halfWidth = width * 0.5, halfHeight = height * 0.5 

        // default position is below the this
        let allPos = {}
        allPos.below = { // below
            x: left - halfWidth + L,
            y: top + po.height + T
        }
        allPos.above = { // above
            x: left - halfWidth + L,
            y: top - B - height
        }
        allPos.left = { // on left
            x: left - R - width,
            y: top - halfHeight - T
        }
        allPos.right = { // on right
            x: left + L,
            y: top - halfHeight - T
        }
        allPos.belowRight = {
            x: (left + po.width) + L,
            y: top + po.height + T
        }
        allPos.belowLeft = {
            x: left + L,
            y: top + po.height + T
        }
        allPos.aboveRight = {
            x: left + L,
            y: top - B - height
        }
        allPos.aboveLeft = {
            x: left + po.width - width + L,
            y: top - B - height
        }

        let possiblePos = []
        if(!positionOrder) positionOrder = ['below', 'above', 'left', 'right']
        positionOrder.forEach(o => {
            if(allPos[o]) possiblePos.push(allPos[o])
        })

      
        let pos = possiblePos.find(p => {
            if(p.x >= 0 && p.x + width <= ww && p.y >= 0 && p.y + height <= wh){
                return true
            }
        })
        if(!pos) pos = possiblePos[0]

        // set the position
        wi.style.position = 'absolute'
        wi.style.left = pos.x + 'px'
        wi.style.top = pos.y + 'px'
        
        
    }

    
}
customElements.define('neu-popup', NeuPopup)
