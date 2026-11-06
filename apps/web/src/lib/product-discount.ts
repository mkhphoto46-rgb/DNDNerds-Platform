export function productDiscount(product:{priceRial:number;variants:{priceRial:number;basePriceRial:number}[]}):number{
 const variant=product.variants.find(v=>v.priceRial===product.priceRial&&v.basePriceRial>v.priceRial&&v.priceRial>=0);
 return variant?Math.floor((variant.basePriceRial-variant.priceRial)/variant.basePriceRial*100):0;
}
