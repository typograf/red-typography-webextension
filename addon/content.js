'use strict';

class App {
    constructor() {
        browser.runtime.onMessage.addListener(message => {
            if (!message) { return; }

            let obj;
            switch(message.command) {
                case 'get-text':
                    obj = this.getText();
                    obj && browser.runtime.sendMessage(obj);
                break;
                case 'set-text':
                    this.setText(message);
                break;
            }
        });
    }

    getText() {
        const
            node = document.activeElement,
            propName = this.getPropName(node);

        if (!propName) {
            return null;
        }

        return {
            command: 'get-text',
            text: node[propName] || '',
            selectionStart: node.selectionStart,
            selectionEnd: node.selectionEnd
        };
    }

    getPropName(node) {
        const tagName = (node.tagName || '').toLowerCase();
        if (tagName === 'input' || tagName === 'textarea') {
            return 'value';
        } else if (node.isContentEditable) {
            return 'textContent';
        }

        return null;
    }

    setNativeValue(element, value) {
        const { set: valueSetter } = Object.getOwnPropertyDescriptor(element, 'value') || {};
        const prototype = Object.getPrototypeOf(element);
        const { set: prototypeValueSetter } = Object.getOwnPropertyDescriptor(prototype, 'value') || {};
  
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            throw new Error('The given element does not have a value setter');
        }
    }

    dispatchEvent(target, type, opt) {
        let res;
        if ((target.nodeType === Node.DOCUMENT_NODE ||
             target.nodeType === Node.ELEMENT_NODE)) {
          const evt = new Event(type, opt);
          res = target.dispatchEvent(evt);
        }
        return !!res;
    }      

    dispatchClipboardEvent(elm, type, opt) {
        let res;
        const evt = new ClipboardEvent(type, opt);
        const {clipboardData} = opt;
        if (clipboardData) {
            const {types} = clipboardData;
            for (const mime of types) {
              const value = clipboardData.getData(mime);
              if (evt.wrappedJSObject) {
                evt.wrappedJSObject.clipboardData.setData(mime, value);
              } else {
                evt.clipboardData.setData(mime, value);
              }
            }
        }
        res = elm.dispatchEvent(evt);
        return !!res;
    }

    dispatchInputEvent(elm, type, opt) {
        let res;
        if (elm && elm.nodeType === Node.ELEMENT_NODE && /^(?:before)?input$/.test(type)) {       
          const evt = new InputEvent(type, opt);
          const {dataTransfer} = opt;
          if (dataTransfer) {
            if (!evt.dataTransfer) {
              evt.dataTransfer = new DataTransfer();
            }
            const {types} = dataTransfer;
            for (const mime of types) {
              const value = dataTransfer.getData(mime);
              if (evt.wrappedJSObject) {
                evt.wrappedJSObject.dataTransfer.setData(mime, value);
              } else {
                evt.dataTransfer.setData(mime, value);
              }
            }
          }
          res = elm.dispatchEvent(evt);
        }
        return !!res;
    }

    replaceEditableContent(node, value) {
        const sel = node.ownerDocument.getSelection();
        const dataTransfer = new DataTransfer();
        sel.selectAllChildren(node);
        this.dispatchEvent(node.ownerDocument, "selectionchange", {
            bubbles: false,
            cancelable: false,
        });
        dataTransfer.setData("text/plain", value);
        let res = this.dispatchClipboardEvent(node, "paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer,
            composed: true,
        });
        if (res) {
            const insertTarget = {
                startContainer: sel.anchorNode,
                startOffset: sel.anchorOffset,
                endContainer: sel.focusNode,
                endOffset: sel.focusOffset,
                collapsed: sel.isCollapsed,
            };
            try {
                res = this.dispatchInputEvent(node, "beforeinput", {
                    dataTransfer,
                    bubbles: true,
                    cancelable: true,
                    inputType: "insertFromPaste",
                    ranges: [insertTarget],
                });
            } catch (e) {
                logErr(e);
                res = true;
            }
            if (res) {
                const frag = document.createDocumentFragment();
                frag.appendChild(document.createTextNode(value));
                sel.deleteFromDocument();
                node.appendChild(frag);
                this.dispatchInputEvent(node, "input", {
                    dataTransfer,
                    bubbles: true,
                    cancelable: false,
                    inputType: "insertFromPaste",
                    ranges: [insertTarget],
                });
            }
        }
        if (!sel.isCollapsed) {
            sel.collapseToEnd();
            this.dispatchEvent(node.ownerDocument, "selectionchange", {
                bubbles: false,
                cancelable: false,
            });
        }
    }

    setText(message) {
        const
            node = document.activeElement,
            isSelectionEqual = message.selectionStart === message.selectionEnd;

        let text = message.text;

        if (!node) { return; }

        const propName = this.getPropName(node);
        if (!propName) { return; }

        if (!isSelectionEqual) {
            text = message.oldText.substring(0, node.selectionStart) +
                message.text +
                message.oldText.substring(node.selectionEnd);
        }

        if (propName === 'value') {
            this.setNativeValue(node, text);            
            node.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            this.replaceEditableContent(node, text);
        }

        if (isSelectionEqual) {
            node.selectionStart = node.selectionEnd = message.selectionStart;
        } else {
            node.selectionStart = message.selectionStart;
            node.selectionEnd = message.selectionStart + message.text.length;
        }
    }
}

new App();
