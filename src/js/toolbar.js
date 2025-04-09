import contentHtml from '../html/toolbar.html?raw'
import Bendis from './bendis.js'

export default class RichTextToolbar extends Bendis {

    constructor() {
        super()

        this.state = {
            textColor: '#000000',
            highlightColor: '#ffffff',
            bold: false,
            italic: false,

            arrTest: [{
                name: "Name 1",
                sub: [{
                    name: "Uno"
                }, {
                    name: "Due"
                }]
            }, {
                name: "Name 2",
                sub: [{
                    name: "Tres"
                }, {
                    name: "Quatro"
                }]
            }, 
            {
                name: "Name 3",
                sub: [{
                    name: "Cinque"
                }, {
                    name: "Ses"
                }]
            }, {
                name: "Name 4",
                sub: [{
                    name: "Set"
                }, {
                    name: "OKTA"
                }]
            }
            ]
        }

        this.view.innerHTML = contentHtml

        // this.bind('arrTest.*', '.TestArray', Array)
        // // this.bind('arrTest.*', '.NoArray', (ctx) => {
        // //     //console.log('NoArray', ctx.val)
        // // })
        // this.bind('arrTest.*.name', '.TestName', (ctx) => {
        //     //console.log('.', ctx.val)
        //     ctx.addEventListener('click', () => {
        //         console.log('Item click', ctx.el)
        //     })
        //     return ctx.defaultCallback(ctx)
        // })
        // this.bind('arrTest.*.sub.*', '.TestSubArray', Array)
        // this.bind('arrTest.*.sub.*.name', '.TestSubName')



        // text color
        let btnColor = this.view.querySelector('.BtnColor')
        let colorInput = this.view.querySelector('.ColorInput')
        let selectedColor = this.selectedColor = this.view.querySelector('.SelectedColor')
        selectedColor.style.backgroundColor = this.state.textColor
        btnColor.addEventListener('click', (ev) => {
            colorInput.click()
        })
        colorInput.addEventListener('input', (ev) => {
            selectedColor.style.backgroundColor = this.state.textColor = colorInput.value;
        })
        colorInput.addEventListener('change', (ev) => {
            let range = this.restoreLastSelection()
            if (range) {
                document.execCommand('foreColor', false, this.state.textColor);
            }
        })

        // highlight color
        let btnHighlight = this.view.querySelector('.BtnHighlight')
        let highlightInput = this.view.querySelector('.HighlightInput')
        let selectedHighlight = this.selectedHighlight = this.view.querySelector('.SelectedHighlight')
        selectedHighlight.style.backgroundColor = this.state.highlightColor
        btnHighlight.addEventListener('click', (ev) => {
            highlightInput.click()
        })
        highlightInput.addEventListener('input', (ev) => {
            selectedHighlight.style.backgroundColor = this.state.highlightColor = highlightInput.value;
        })
        highlightInput.addEventListener('change', (ev) => {
            let range = this.restoreLastSelection()
            if (range) {
                document.execCommand('hiliteColor', false, this.state.highlightColor);
            }
        })

        // bold
        let btnBold = this.view.querySelector('.BtnBold')
        btnBold.addEventListener('click', () => {
            this.state.bold = !this.state.bold
            let range = this.restoreLastSelection()
            if (range) {
                document.execCommand('bold', false, null);
            }
        })

        // italic
        let btnItalic = this.view.querySelector('.BtnItalic')
        btnItalic.addEventListener('click', () => {
            this.state.italic = !this.state.italic
            let range = this.restoreLastSelection()
            if (range) {
                document.execCommand('italic', false, null);
            }
        })

        // underline
        let btnUnderline = this.view.querySelector('.BtnUnderline')
        btnUnderline.addEventListener('click', () => {
            this.state.underline = !this.state.underline
            let range = this.restoreLastSelection()
            if (range) {
                document.execCommand('underline', false, null);
            }
        })

        // fontSize
        let select = this.view.querySelector('.Select select')
        select.addEventListener('change', (ev) => {
            let range = this.restoreLastSelection()
            if (range) {
                document.execCommand('fontSize', false, select.value);
            }
        })

        // Link
        let btnLink = this.view.querySelector('.BtnLink')
        let linkPopup = btnLink.querySelector('neu-popup')
        btnLink.addEventListener('click', (ev) => {
            if (!this.lastRange) return
            linkPopup.state.text = this.lastSelectionText //this.getSelectionText()
            linkPopup.open = true
        })
        let createLink = (text, link) => {
            if (!this.lastRange) return
            this.restoreLastSelection()
            this.replaceSelectedText(text)
            document.execCommand('createLink', true, link);
            linkPopup.open = false
        }
        linkPopup.bind('text', '.LinkPopupText input')
        linkPopup.addEventListener('load', () => {
            let text = linkPopup.container.querySelector('.LinkPopupText input')
            let link = linkPopup.container.querySelector('.LinkPopupLink input')
            text.addEventListener('keyup', (ev) => {
                if (ev.key == 'Enter' && link.value && text.value) {
                    createLink(text.value, link.value)
                }
            })
            link.addEventListener('keyup', (ev) => {
                if (ev.key == 'Enter' && link.value && text.value) {
                    createLink(text.value, link.value)
                }
            })
        })

        // Add Comment
        let btnComment = this.view.querySelector('.BtnAddComment')
        btnComment.addEventListener('click', (ev) => {

            let range = this.restoreLastSelection()
            if (!range) return

            // {
            //     document.execCommand('fontSize', false, select.value);
            // }

            let refId = Math.random().toString().substring(2)
            this.commentPending = {
                refId,
                range: range.cloneRange()
            }

            // document.execCommand('fontSize', false, select.value);

            let r = document.execCommand('hiliteColor', false, '#FEFF1E');
            //range = this.restoreLastSelection()



            //range.anchorNode.dataset.refid = refId


            this.dispatchEvent(new CustomEvent('add-comment-request', {
                detail: {
                    refId
                },
                bubbles: true,
                composed: true,
                cancelable: true
            }))
        })





        // selection
        this.initWatchSelection()

        // mentions
        this.mentions.state.items = []
        this.mentions.bind('items.*', '.ContextItem', Array)
        this.mentions.bind('items.*.name', '.ContextMiddle', (ctx) => {
            ctx.addEventListener('click', () => {
                console.log('Replace the @ with', ctx.obj.username)
                this.dispatchEvent(new CustomEvent('mentioned-user', {
                    detail: {
                        user: this.mentions.copy(ctx.obj)
                    },
                    bubbles: true,
                    composed: true,
                    cancelable: true
                }))
                this.mentions.open = false
            })
            ctx.defaultCallback()
        })
        this.mentions.bind('items', '.ContextEmpty', (ctx) => {
            setTimeout(() => {
                let {
                    el,
                    val
                } = ctx
                el.style.display = val && val.length ? 'none' : 'block'
            }, 0)
        })



        this.onKey((ev) => {
            // Watch for mentions popup
            if (ev.key == ' ') return this.mentions.open = false
            setTimeout(() => {
                let range = this.currentRange

                if (!range) return this.mentions.open = false
                let keys = range.endContainer && range.endContainer.data ? range.endContainer.data.substring(0, range.endOffset) : ''
                if (!keys || !keys.length) return this.mentions.open = false

                // match last @ with space before (unless it's first char) and non space characters after until the end of the keys buffer
                let lio = keys.lastIndexOf('@')
                if (lio === -1) return this.mentions.open = false
                let query = undefined
                if (
                    (lio === 0 && keys.length == 1) ||
                    (lio < keys.length - 1 && keys[lio - 1] == ' ' && !keys.substring(lio, keys.length).includes(' '))
                ) {
                    query = keys.substring(lio + 1, keys.length)
                }
                if (query === undefined && keys.length - lio == 1) query = ''
                if (query !== undefined) {
                    this.dispatchEvent(new CustomEvent('mention-query', {
                        detail: {
                            query,
                            setMentionItems: (items) => this.setMentionItems(items)
                        },
                        bubbles: true,
                        composed: true,
                        cancelable: true
                    }))
                    this.mentions.open = true
                    this.positionMentions(this.lastRange)
                    setTimeout(() => {
                        this.setMentionItems([{
                            name: "Foo Bar",
                            username: "foobar"
                        }, {
                            name: "Foo Baz",
                            username: "foobaz"
                        }, {
                            name: "Foo Blah",
                            username: "fooblah"
                        }])
                    }, 300)
                } else {
                    this.mentions.open = false
                }
            }, 0)

        })
    }

    setMentionItems(mentions) {
        this.mentions.state.items = []
        if (!Array.isArray(mentions)) throw Error("Mentions must be in an array")
        for (let i = 0; i < mentions.length; i++) {
            let m = mentions[i]
            if (!m.name || !m.username) {
                throw Error(`Mention item object must have at least "name" property and the "username" property`)
            }
            if (!m.id) m.id = m.username
            this.mentions.state.items.push(m)
        }
        return this.mentions.state.items
    }

    get currentRange() {
        let sel = window.getSelection()
        if (sel.rangeCount) {
            return sel.getRangeAt(0)
        }
    }

    replaceSelectedText(replacementText, customRange = null) {
        var sel, range;
        if (window.getSelection) {
            sel = window.getSelection();
            if (sel.rangeCount) {
                range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(replacementText));
            }
        } else if (document.selection && document.selection.createRange) {
            range = document.selection.createRange();
            range.text = replacementText;
        }
    }

    getSelectionText() {
        var text = "";
        if (window.getSelection) {
            text = window.getSelection().toString();
        } else if (document.selection && document.selection.type != "Control") {
            text = document.selection.createRange().text;
        }
        return text;
    }

    set editor(ed) {
        if (this._editor) this.unwatchSelection(this._editor)
        this._editor = ed
        this.watchSelection(this._editor, (ctx) => {
            let {
                range
            } = ctx
            this.lastRange = range.cloneRange()
            this.lastSelectionText = this.getSelectionText()
        })
        this.watchForKeyStrokes()
    }
    get editor() {
        return this._editor
    }

    // getRange(){
    //     if(!this.editor) return
    //     let sel = document.getSelection()
    //     if(!sel.rangeCount) return
    //     let range = sel.getRangeAt(0)
    //     if(this.editor.contains(range.startContainer) || this.editor.contains(range.endContainer)){
    //         return range
    //     }
    // }

    setEditor(el) {
        this.editor = el;
    }

    initWatchSelection() {
        let sel = document.getSelection(),
            range
        document.addEventListener('selectionchange', ev => {
            if (!sel.rangeCount) return
            if (this.wsels && this.wsels.length) {
                range = sel.getRangeAt(0)
                this.wsels.forEach(s => {
                    if (!s.el.isConnected) {
                        this.unwatchSelection(s.el)
                    } else if (s.el.contains(range.endContainer)) {
                        s.range = range
                        if (s.skipNext) {
                            s.skipNext = s.skipNext - 1
                        } else {
                            s.cb(s)
                        }
                    }
                })
            }
        })
    }
    watchSelection(el, cb) {
        if (!this.wsels) this.wsels = []
        this.wsels.push({
            el,
            cb
        })
    }
    unwatchSelection(el) {
        if (!this.wsels || !this.wsels.length) return
        for (let i = this.wsels.length - 1; i >= 0; i = i - 1) {
            if (this.wsels[i].el == el) this.wsels.splice(i, 1)
        }
    }

    restoreLastSelection() {
        let range = this.lastRange
        if (range) {
            let sel = document.getSelection()
            sel.removeAllRanges()
            sel.addRange(range)
        }
        return range
    }

    onKey(key, cb) {
        if (typeof key == 'function') {
            cb = key
            key = 'ANY_KEY'
        } else if (key.length > 1) key = key[0]
        if (!this._keyCb) this._keyCb = {}
        if (!this._keyCb[key]) this._keyCb[key] = []
        this._keyCb[key].push(cb)
    }
    watchForKeyStrokes() {
        if (!this.editor) return
        let keyBufLen = 128
        this._lastKeys = []
        if (!this.keyFunc) this.keyFunc = (ev) => {
            if (this._keyCb && this._keyCb[ev.key]) {
                this._keyCb[ev.key].forEach(k => k(ev, this._lastKeys))
            } else if (this._keyCb['ANY_KEY'] != undefined) this._keyCb['ANY_KEY'].forEach(k => k(ev, this._lastKeys))
            this._lastKeys.push(ev.key)
            if (this._lastKeys.length > keyBufLen) this._lastKeys.shift()
        }
        this.editor.removeEventListener('keydown', this.keyFunc)
        this.editor.addEventListener('keydown', this.keyFunc)
    }



    positionMentions(el) {
        this.mentions.bubblePos(el, ['above', 'below', 'left', 'right'])
    }
    get mentions() {
        if (this._mentions) return this._mentions
        this._mentions = this.view.querySelector('.MentionPopup')
        return this._mentions
    }





}

customElements.define('rich-text-toolbar', RichTextToolbar)