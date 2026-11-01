import assert from 'node:assert/strict';
import {test} from 'node:test';
import {addCartItem,cartItemKey,readCart,removeCartItem,setCartItemQuantity} from './cart';
test('editing and removing a color leaves the other color in the cart untouched',()=>{
 const saved=new Map<string,string>();const original=globalThis.window;
 Object.assign(globalThis,{window:{localStorage:{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v),removeItem:(k:string)=>saved.delete(k)},dispatchEvent:()=>true}});
 try{const item={productId:'product',productSlug:'dice',productName:'Dice',storeSlug:'store',storeName:'Maker',unitPriceToman:100,inventory:10,quantity:1};addCartItem({...item,variantId:'blue'});addCartItem({...item,variantId:'red'});
 setCartItemQuantity(cartItemKey({...item,variantId:'blue'}),3);assert.deepEqual(readCart().map(i=>[i.variantId,i.quantity]),[['blue',3],['red',1]]);
 removeCartItem(cartItemKey({...item,variantId:'red'}));assert.deepEqual(readCart().map(i=>i.variantId),['blue']);
 }finally{Object.assign(globalThis,{window:original});}
});
