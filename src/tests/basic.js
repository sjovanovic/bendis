import Bendis from '../js/bendis'

const layoutHtml = `
<style>
  .List {
    display:flex;
    flex-direction:column;
    gap: 6px;
  }
  .Item{
    border:1px solid #aaa;
    border-radius: 6px;
    padding: 6px;
    margin: 0px 6px;
  }
  .selected {
    background-color: #eee;
  }
</style>
<div>
  <div class="List">
    <div class="Item">
      <div class="ItemWrap">
        <input class="Checked" type="checkbox" /> 
        <span class="Name"></span>
        <select>
          <option class="Children"></option>
        </select>
      </div>
    </div>
  </div>
</div>`

class BasicTest extends Bendis {
    constructor() {
        super()
        this.state = {
          items:[]
        }
        this.view.innerHTML = layoutHtml

        // bind items array to the .Item selector
        this.bind('items.*', '.Item', Array)
        // bind the name property in the items array to the .Name selector
        this.bind('items.*.name', '.Name')

        // checkbox
        this.bind('items.*.checked', '.Checked')
        this.watch('items.*.checked', ({val})=>{
          console.log(val ? 'Checked' : 'Unchecked')
        })

        // single select/unselect
        this.bind('items.*.selected', '.Item', (ctx)=>{
          let {el, obj, val} = ctx
          el.classList[val ? 'add' : 'remove']('selected')
          ctx.addEventListener('click', ()=>{
            obj.selected = val ? false : true
            this.state.items.forEach(item => item != obj ? item.selected = false : null)
          })
        })
        // watch changes to the selected property in the items array
        this.watch('items.*.selected', ({val})=>{
          console.log(val ? 'Selected' : 'Unselected')
        })

        // children - bind children sub array of objects to the select option
        this.bind('items.*.children.*', '.Children', Array)
        this.bind('items.*.children.*.name', '.Children')
        this.bind('items.*.children.*.selected', '.Children', (ctx)=>{
          let {el, val} = ctx
          el.selected = val ? "selected" : null
        })
        
    }

    connectedCallback(){
      let results = [
        {
          name: 'Item One',
          selected: false,
          checked: false,
        },
        {
          name: 'Item Two',
          selected: true,
          checked: false
        },
        {
          name: 'Item Three',
          selected: false,
          checked: true
        }
      ]

      // child items
      results.forEach(r => {
        r.children = JSON.parse(JSON.stringify(results))
      })

      this.state.items = results


      // this.state.items.length = 0
      // results.forEach(r => this.state.items.push(r))
    }
}

customElements.define('basic-test', BasicTest)