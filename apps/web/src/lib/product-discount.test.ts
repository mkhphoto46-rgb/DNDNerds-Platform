import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productDiscount} from './product-discount.js';
test('discount follows the displayed effective variant price, not array position',()=>{
 assert.equal(productDiscount({priceRial:60,variants:[{priceRial:100,basePriceRial:100},{priceRial:60,basePriceRial:100}]}),40);
 assert.equal(productDiscount({priceRial:100,variants:[{priceRial:100,basePriceRial:100}]}),0);
 assert.equal(productDiscount({priceRial:100,variants:[{priceRial:60,basePriceRial:100}]}),0);
 assert.equal(productDiscount({priceRial:100,variants:[]}),0);
});
