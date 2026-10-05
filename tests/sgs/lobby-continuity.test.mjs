import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileKeyedHTML, installComposedSearch, focusAfterFilterRemoval } from '../../apps/core/sgs/lobby-continuity.mjs';

// Tiny keyed DOM, including browsers' focus loss when a focused node is moved.
function fixture() {
  const document = {activeElement:null};
  class Element {
    constructor() { this.attrs=new Map();this.children=[];this.contentWrites=0;this.ownerDocument=document;this.scrollTop=70; }
    get attributes() {return [...this.attrs].map(([name,value])=>({name,value}));}
    getAttribute(k) {return this.attrs.get(k)??null;}
    hasAttribute(k) {return this.attrs.has(k);}
    setAttribute(k,v) {this.attrs.set(k,v);}
    removeAttribute(k) {this.attrs.delete(k);}
    closest() {return this;}
    contains(node) {return this.children.includes(node);}
    get innerHTML(){return this.html||'';}
    set innerHTML(html){this.html=html;this.contentWrites++;this.children=[];for(const [,attrs,body]of html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)){const n=new Element();for(const [,k,v]of attrs.matchAll(/([\w-]+)="([^"]*)"/g))n.setAttribute(k,v);n.innerHTML=body;this.insertBefore(n,null);}}
    insertBefore(node,before){if(node.parent){if(document.activeElement===node)document.activeElement=null;node.remove();}const i=before?this.children.indexOf(before):this.children.length;this.children.splice(i,0,node);node.parent=this;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;if(document.activeElement===this)document.activeElement=null;}
    focus(){document.activeElement=this;}
    querySelectorAll(){return this.children;}
  }
  document.createElement=()=>new Element();
  return {document,container:new Element(),Element};
}
const row=(key,selected=false)=>`<button data-key="${key}" class="card${selected?' selected':''}" aria-pressed="${selected}"><img src="${key}.webp"><span>${key}</span></button>`;

test('selection retains the exact button, portrait content, focus and scroll while updating selection attributes',()=>{
  const {container,document}=fixture();reconcileKeyedHTML(container,row('a')+row('b'),'data-key');
  const [a,b]=container.children;const writes=a.contentWrites;a.focus();
  reconcileKeyedHTML(container,row('a',true)+row('b'),'data-key');
  assert.equal(container.children[0],a);assert.equal(container.children[1],b);assert.equal(document.activeElement,a);
  assert.equal(a.contentWrites,writes);assert.equal(a.getAttribute('aria-pressed'),'true');assert.equal(container.scrollTop,70);
});

test('sort and filtering reuse surviving nodes, restore moved focus and remove obsolete results',()=>{
  const {container,document}=fixture();reconcileKeyedHTML(container,row('a')+row('b')+row('c'),'data-key');
  const [a,b,c]=container.children;c.focus();reconcileKeyedHTML(container,row('c')+row('a'),'data-key');
  assert.deepEqual(container.children,[c,a]);assert.equal(document.activeElement,c);assert.equal(b.parent,null);
  reconcileKeyedHTML(container,row('d')+row('c'),'data-key');assert.equal(container.children[1],c);assert.equal(a.parent,null);
});

test('IME emits only committed search text and disposes all listeners',()=>{
  const listeners=new Map(), seen=[];const input={value:'',addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  const dispose=installComposedSearch(input,x=>seen.push(x));
  listeners.get('compositionstart')();input.value='shen';listeners.get('input')({isComposing:false});
  assert.deepEqual(seen,[]);input.value='神黄忠';listeners.get('compositionend')();assert.deepEqual(seen,['神黄忠']);
  input.value='曹操';listeners.get('input')({isComposing:true});assert.equal(seen.length,1);
  listeners.get('input')({isComposing:false});assert.equal(seen[1],'曹操');dispose();assert.equal(listeners.size,0);
});

test('removed filter focuses its successor, then predecessor, or search when no conditions remain',()=>{
  const {container,document,Element}=fixture();const fallback=new Element();
  const a=new Element(),b=new Element();container.children=[a,b];
  focusAfterFilterRemoval(container,1,fallback);assert.equal(document.activeElement,b);
  container.children=[a];focusAfterFilterRemoval(container,1,fallback);assert.equal(document.activeElement,a);
  container.children=[];focusAfterFilterRemoval(container,0,fallback);assert.equal(document.activeElement,fallback);
});
