export const marketplaceCategoryLabels:Record<string,string>={dice:'تاس و ابزار تاس',miniatures:'مینیاتور و فیگور',clothing:'پوشاک',accessories:'اکسسوری و ماکت',books:'کتاب و ابزار بازی'};
export const marketplaceAttributeLabels:Record<string,string>={color:'رنگ',material:'جنس',faces:'تعداد وجه',scale:'مقیاس',painted:'وضعیت رنگ',size:'اندازه',model:'مدل',language:'زبان',edition:'ویرایش'};
export const categoryLabel=(value:string)=>marketplaceCategoryLabels[value]??value;
export const attributeLabel=(value:string)=>marketplaceAttributeLabels[value]??value;
export const supplyLabel=(value:string)=>({READY_TO_SHIP:'آمادهٔ ارسال',MADE_TO_ORDER:'ساخت پس از سفارش',CUSTOM_DESIGN:'ساخت سفارشی'}[value]??value);
