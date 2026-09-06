# Flexisearch/SQL Queries

Queries to be used in the Admin section of backoffice.

[Helpful page from SAP on Flexisearch](https://help.sap.com/docs/SAP_COMMERCE/d0224eca81e249cb821f2cdf45a82ace/8bc33bb28669101481ccfb446695e9de.html?version=1905&locale=en-US)

## SAPC - Known working queries

### Flexisearch

SELECT {P:CODE} 'Article Number', {SL:ZDC} 'DC Stock', {SL:ZRS} 'Regular Store Stock', {SL:ZSFS} 'Ship frm Store Stock', {P:APPROVALSTATUS} 'Approval Status'

FROM { PRODUCT AS P

JOIN STOCKLEVEL AS SL ON {P:CODE}={SL:PRODUCTCODE}

}

WHERE {P:APPROVALSTATUS} = '8796100526171'

```
```

 

8796100526171 = Unapproved | 8796100493403 = Approved | 8796093120603 = Check

SELECT {P:CODE} 'Article Number', {SL:ZDC} 'DC Stock', {SL:ZRS} 'Regular Store Stock', {SL:ZSFS} 'Ship frm Store Stock'

FROM { PRODUCT AS P

JOIN STOCKLEVEL AS SL ON {P:CODE}={SL:PRODUCTCODE}

}

WHERE {P:VIRTUALSTOCKONSITE} is not NULL

SELECT DISTINCT {O:CODE} 'Order Number', {O:ORIGINALCARTCODE} 'Original Cart Code'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN ADDRESS AS BA ON {O:PAYMENTADDRESS}={BA:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

}

WHERE {O:ORIGINALCARTCODE} IN ('')

SELECT {p.code}

FROM {product as p join catalogversion as cv on {p.catalogversion}={cv.pk}

JOIN catalog as c on {cv.catalog}={c.pk}

LEFT JOIN pricerow as pr on {pr.product}={p.pk}}

WHERE {c.id}='masterProductCatalog' and {cv.version}='Staged' and {pr.pk} is null

AND {p.code} LIKE '17%'

AND {p.approvalstatus} = 8796100493403

SELECT {P:CODE}

FROM { PRODUCT AS P

}

WHERE {P:APPROVALSTATUS} = '8796100493403'

AND {P:CATALOGVERSION} = '8796125889113'

AND

( {P:EXCLUDEDFROMFINANCEPROVIDERS} like '%8796125841977%' OR {P:EXCLUDEDFROMFINANCEPROVIDERS} like '%8796125874745%')

 

8796100526171 = Unapproved | 8796100493403 = Approved | 8796093120603 = Check

8796125841977 = Mayors | 8796125874745 = WOSUS


SELECT {BS:UID} 'Fascia', {O:DATE} 'Date', {O:CODE} 'Order Number', {ADD:POSTALCODE} 'Delivery Post Code', {BILL:POSTALCODE} 'Billing Post Code', {ev2:code} 'WES or WEB', {ev1:code} 'Delivery Type'

FROM { ORDER AS O

JOIN ADDRESS AS ADD ON {O:DELIVERYADDRESS}={ADD:PK}

JOIN ADDRESS AS BILL ON {O:PAYMENTADDRESS}={BILL:PK}

JOIN BASESITE AS BS ON {O:SITE}={BS:PK}

JOIN EnumerationValue AS ev1 ON {O:DELIVERYTYPE}={ev1:PK}

JOIN EnumerationValue AS ev2 ON {O:SALESAPPLICATION}={ev2:PK}

}

WHERE {O:DATE} \>= '2021-10-11' AND {O:DATE} \<= '2021-10-12' 

‘Sales Application' and 'Delivery Type’ are enum types so they need *EnumerationValue*

select DISTINCT {p.code} from {SAPArticle as a join Product as p on {a.productcode} = {p.code}} where {a.sapSiteProductMaster} is null

SELECT {o.code}, {o.date} FROM {Order AS o JOIN OrderProcess AS op ON {op.order} = {[o.pk](http://o.pk)} JOIN ProcessTask AS pt ON {pt.process} = {[op.pk](http://op.pk)}}

WHERE {pt.action} = "waitForSAPApprovalTransmissionConfirmation" AND {o.date} \<= "2022-03-15 00:00:00.000"

SELECT {o.code} 

FROM {Order AS o JOIN OrderProcess AS op ON {op.order} = {o.pk} JOIN ProcessTaskLog AS ptl ON {ptl.process} = {op.pk}} 

WHERE {ptl.actionId} in ('attemptToRegisterOrderApprovalWithSAP','attemptToTransmitOrderToSAP','attemptToSendSuccessfulOPA','attemptToSendUnsuccessfulOPA') AND {ptl.returnCode} IS NULL AND {o.date} \>= '2022-04-19 00:00:00.000'

GROUP BY {o.PK}

having count(\*) \> 0

SELECT {CU:UID} 'Email', {CT:ID} 'Consent Type', {C:CONSENTGIVENDATE} 'Date Consented', {BS:UID} 'Site Consented On', {CU:AURUMBPID} 'BP'

FROM { CONSENT AS C

JOIN CONSENTTEMPLATE AS CT ON {C:CONSENTTEMPLATE}={CT:PK}

JOIN CUSTOMER AS CU ON {C:CUSTOMER}={CU:PK}

JOIN BASESITE AS BS ON {CT:BASESITE}={BS:PK}}

WHERE {C:CREATIONTIME} \>= '2022-03-01'

ORDER BY {CU:UID}

SELECT 

{BS:NAME} 'Store Name',

{O:CODE} 'Order Number', 

{O:DATE} 'Order Date', 

{OS:NAME} 'Order Status', 

{O:TOTALPRICE} 'Total Order Value',

{CT:CODE} 'Consignment Status', 

{C:shippingDate} 'Consignment Shipped',

{P:CODE} 'Article SKU',

{OE:BASEPRICE} 'Article Price', 

{P:MANUFACTURERNAME} 'Article Brand', 

{O:SALESAPPLICATION} 'Sales Application', 

{PT:CODE} ' Product Type', 

LEFT(

  SUBSTRING(CAST({O:APPLIEDCOUPONCODES} AS CHAR(10000)), 54, 10000), 

  LENGTH(SUBSTRING(CAST({O:APPLIEDCOUPONCODES} AS CHAR(10000)), 54, 10000)) -1) AS 'Coupon', {PTN:PAYMENTPROVIDER} 'Payment Provider'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN CONSIGNMENT AS C ON {O:PK}={C:ORDER}

JOIN CONSIGNMENTSTATUS AS CT ON {C:STATUS}={CT:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

JOIN PRODUCTTYPE AS PT ON {P:PRODUCTTYPE}={PT:PK}

JOIN PAYMENTINFO AS PI ON {O:PAYMENTINFO}={PI:PK}

JOIN PAYMENTTRANSACTION AS PTN ON {O:PK}={PTN:ORDER}

}

WHERE {O:DATE} \>= '2022-05-15' AND {O:DATE} \<= '2022-11-30'

SELECT {BS:NAME} 'Store Name',{O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {O:TOTALPRICE} 'Total Order Value', {ev2:code} 'WES or WEB', {ev1:code} 'Delivery Type', {R:ISOCODESHORT} 'StateShort'

 

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

JOIN ADDRESS AS ADD ON {O:DELIVERYADDRESS}={ADD:PK}

JOIN EnumerationValue AS ev1 ON {O:DELIVERYTYPE}={ev1:PK}

JOIN EnumerationValue AS ev2 ON {O:SALESAPPLICATION}={ev2:PK}

JOIN REGION AS R ON {ADD:REGION}={R:PK}

}

WHERE {O:DATE} \>= '2022-08-30' AND {O:DATE} \<= '2022-09-20'

AND {BS:NAME} = 'Mayors' OR {BS:NAME} = 'Watches Of Switzerland US'

SELECT {BS:NAME} 'Store Name', {O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {O:TOTALPRICE} 'Total Order Value',{CT:CODE} 'Consignment Status', {C:shippingDate} 'Consignment Shipped',{P:CODE} 'Article SKU',{OE:BASEPRICE} 'Article Price', {P:MANUFACTURERNAME} 'Article Brand', {O:SALESAPPLICATION} 'Sales Application', {PT:PAYMENTPROVIDER} 'Payment Provider',  {PI:ADYENPAYMENTMETHOD} 'Payment Method'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN CONSIGNMENT AS C ON {O:PK}={C:ORDER}

JOIN CONSIGNMENTSTATUS AS CT ON {C:STATUS}={CT:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}

JOIN PAYMENTINFO AS PI ON {PT:INFO}={PI:PK}

}

WHERE {O:DATE} \>= '2022-11-15' AND {O:DATE} \<= '2022-11-20'

SELECT {O:CODE} 'Order Number', {ev2:code} 'WES or WEB', {O:WESSTOREID} 'WES Store ID'

FROM { ORDER AS O

JOIN EnumerationValue AS ev2 ON {O:SALESAPPLICATION}={ev2:PK}

}

WHERE {O:DATE} \>= '2020-01-01' AND {ev2:code} = 'WES' AND {O:WESSTOREID} = '197'

SELECT {O:CODE} 'Order Number', {O:DISCOUNTEMPLOYEENAME} 'Employee Name' , {O:DISCOUNTEMPLOYEEPAYROLLNUMBER} 'Payroll Number', {O:SUBTOTAL} 'Subtotal', {O:TOTALDISCOUNTS} 'Total Discount', {O:TOTALPRICE} 'Total Price', {O:DATE} 'Order Date'

FROM { ORDER AS O } WHERE {O:DISCOUNTEMPLOYEENAME} is not NULL AND {O:DISCOUNTEMPLOYEEPAYROLLNUMBER} is not NULL

SELECT {O:CODE} 'Order No.', {O:DATE} 'Order Date', {U:NAME} 'Customer Name', {O:SUBTOTAL} 'Subtotal', {O:TOTALDISCOUNTS} 'Total Discount', {O:TOTALPRICE} 'Total Price', {O:DISCOUNTEMPLOYEENAME} 'Employee Name', {O:DISCOUNTEMPLOYEEPAYROLLNUMBER} 'Payroll No',  LEFT(  
  SUBSTRING(CAST({O:globaldiscountvaluesinternal} AS CHAR(8000)), 6, 14),  
  LEN(SUBSTRING(CAST({O:globaldiscountvaluesinternal} AS CHAR(8000)), 6, 14)) -1) AS 'Discount Reason',  
(  
   CASE  
      WHEN {O:globaldiscountvaluesinternal} LIKE '%true%'  
      THEN 'Absolute'  
      ELSE 'Percentage'  
   END  
) as 'Discount Type'  
FROM { ORDER AS O JOIN USER AS U ON {U:PK} = {O:USER}} WHERE {O:globaldiscountvaluesinternal} LIKE '%StaffDiscount%'

The following FlexibleSearch statement returns the PKs of every **Category** whose **code** attribute does not contain the string **test**.

- 

```
SELECT {c:pk} FROM {Category AS c} WHERE {c:code} NOT LIKE '%test%'
```

```
SELECT {O:CODE} 'Order Number', {O:DATE} 'Date', {O:SAPEmployees} 'Payroll', {O:WESSTOREID} 'WES Store', {PT:PAYMENTPROVIDER} 'Payment Provider', {P:CODE} 'Article SKU'
FROM { ORDER AS O
JOIN SALESAPPLICATION as SA on {O:SALESAPPLICATION}={SA:PK}
JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}
JOIN ORDERENTRY AS OE ON {O:PK}={OE:ORDER}
JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}
}
WHERE {O:SAPEMPLOYEES} is null
AND {SA:CODE} in ('WES')
AND {O:DATE} >= '2023-01-01' AND {O:DATE} <= '2023-02-14'
```


SELECT {O:CODE} 'Order No.', {U:UID} 'User UID', (  
   CASE  
      WHEN {C:TYPE} = '8796093055067'  
      THEN 'Registered'  
      WHEN {C:TYPE} = '8796111175771'  
  	  THEN 'Guest'  
  	  ELSE 'Other'  
   END  
) as 'Guest or Registered', {O:DATE} 'Order Date'  
FROM {Order as O  
	JOIN USER AS U ON {U:PK} = {O:USER}  
    JOIN Customer as C on {C:UID} = {U:UID}  
    }  
WHERE {O:DATE} \>= '2023-01-30' AND {O:DATE} \<= '2023-02-05'

SELECT \* FROM  
(  
   {{  
      SELECT COUNT(*) as 'Count', (CASE WHEN {C:TYPE} = '8796111175771' THEN 'Guest' END) as 'Type'*  
*		FROM {Order as O*  
*				JOIN USER AS U ON {U:PK} = {O:USER}*  
*    			JOIN Customer as C on {C:UID} = {U:UID}*  
*    		 }*  
*		WHERE {O:DATE} \>= '2023-01-30' AND {O:DATE} \<= '2023-02-05' AND {C:TYPE} = '8796111175771'*  
*   }}*  
*   UNION ALL*  
*   {{*  
*      SELECT COUNT(*) as 'Count', (CASE WHEN {C:TYPE} = '8796093055067' THEN 'Registered' END) as 'Type'  
		FROM {Order as O  
				JOIN USER AS U ON {U:PK} = {O:USER}  
    			JOIN Customer as C on {C:UID} = {U:UID}  
    		 }  
		WHERE {O:DATE} \>= '2023-01-30' AND {O:DATE} \<= '2023-02-05' AND {C:TYPE} = '8796093055067'  
   }}  
) uniontable

SELECT {P:CODE} 'Article Number', {P:USEPNGIMAGEFORMAT} 'is PNG', {PT:CODE} 'Product Type'

FROM { PRODUCT AS P 

JOIN PRODUCTTYPE AS PT ON {P:PRODUCTTYPE}={PT:PK} }

WHERE {PT:CODE} IN ('Bracelets','Earrings','Jewellery', 'Jewellery Sets', 'Necklaces', 'Ring', 'Rings')

AND {P:USEPNGIMAGEFORMAT} = true

SELECT {BS:NAME} 'Store Name', {O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {O:TOTALPRICE} 'Total Order Value',{CT:CODE} 'Consignment Status', {C:shippingDate} 'Consignment Shipped',{P:CODE} 'Article SKU',{OE:BASEPRICE} 'Article Price', {P:MANUFACTURERNAME} 'Article Brand', {O:SALESAPPLICATION} 'Sales Application', {PT:PAYMENTPROVIDER} 'Payment Provider',  {PI:ADYENPAYMENTMETHOD} 'Payment Method'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN CONSIGNMENT AS C ON {O:PK}={C:ORDER}

JOIN CONSIGNMENTSTATUS AS CT ON {C:STATUS}={CT:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}

JOIN PAYMENTINFO AS PI ON {PT:INFO}={PI:PK}

}

WHERE {PI:ADYENPAYMENTMETHOD} IN ('paywithgoogle', 'mc\_googlepay', 'visa\_googlepay', 'amex\_googlepay')

SELECT {C:UID} 'Email', {C:CREATIONTIME} 'Date/Time Registered', {s:name} 'Registration Site'  
FROM { CUSTOMER AS C  
JOIN CustomerType AS t ON {[t.pk](http://t.pk)} = {C.type}  
JOIN BaseSite AS s ON {[s.pk](http://s.pk)} = {C.Registrationsite}  
}  
WHERE {C:CREATIONTIME} \>= '2024-01-01'  
AND {t:code} = 'REGISTERED'  
AND {s:name} = 'Goldsmiths'  
ORDER BY {C:UID}

/\*  
AND {s:name} = 'Goldsmiths'  
AND {s:name} = 'Mappin and Webb'  
AND {s:name} = 'Watches Of Switzerland UK'  
AND {s:name} = 'Hallmark'  
AND {s:name} = 'Mayors'  
AND {s:name} = 'Watches Of Switzerland US'  
AND {s:name} = 'Betteridge'  
\*/

`select {p:code} from {CategoryProductRelation as cpr join Product as p on {cpr:target} = {p:pk}}`

`where {cpr:source} = 8798729568398`

`and {p:code} not in ({{ select {p2:code} from {CategoryProductRelation as cpr2 join Product as p2 on {cpr2:target} = {p2:pk}} where {cpr2:source} = 8798791893134 }})`

SELECT DISTINCT {BS:NAME} 'Store Name', {O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {O:TOTALPRICE} 'Total Order Value',{CT:CODE} 'Consignment Status', {C:shippingDate} 'Consignment Shipped',{P:CODE} 'Article SKU',{OE:BASEPRICE} 'Article Price', {P:MANUFACTURERNAME} 'Article Brand', {SA:CODE} 'Sales Application', {O:DELIVERYMESSAGE} 'Delivery Message', {C:TRACKINGID} 'Tracking ID', {PT:PAYMENTPROVIDER} 'Payment Provider',  {PI:ADYENPAYMENTMETHOD} 'Payment Method'  
FROM { ORDERENTRY AS OE  
JOIN ORDER AS O ON {OE:ORDER}={O:PK}  
JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}  
JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}  
LEFT JOIN CONSIGNMENT AS C ON {O:PK}={C:ORDER}  
LEFT JOIN CONSIGNMENTSTATUS AS CT ON {C:STATUS}={CT:PK}  
JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}  
JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}  
JOIN PAYMENTINFO AS PI ON {PT:INFO}={PI:PK}  
JOIN SALESAPPLICATION AS SA ON {O:SALESAPPLICATION} = {SA:PK}  
}  
WHERE {O:DELIVERYMESSAGE} IN ('1-2 Days')  
AND {O:DATE} \>= '2024-10-08'  
AND {P:CODE} LIKE '4%'

WHERE {O:DATE} \>= CONVERT(Date, DATEADD(month, -1, GETDATE()))  
AND {O:DATE} \<= CONVERT(Date, GETDATE())

e.g.

SELECT {O:DATE} 'Order Date', {BS:NAME} 'Store Name', {O:CODE} 'Order Number', {OS:CODE} 'Order Status', {PS:NAME} 'Payment Status', {PT:paymentprovider} 'Payment Provider', {O:ORIGINALCARTCODE} 'Cart ID', {SA:CODE} 'Sales Application Type', {O:TOTALPRICE} 'Total Price'  
FROM { ORDER AS O  
JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}  
JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}  
JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}  
JOIN PaymentStatus as PS on {O:paymentStatus}={PS:PK}  
JOIN SalesApplication as SA on {O:salesApplication}={SA:PK}  
}  
WHERE {O:DATE} \>= CONVERT(Date, DATEADD(month, -1, GETDATE()))  
AND {O:DATE} \<= CONVERT(Date, GETDATE())  
ORDER BY {O:DATE} Desc

SELECT {POS:NAME} 'Store Name', {B:CODE} 'Brand Code'  
FROM {StoreBrand as B  
JOIN StoreBrandRelation as REL ON {B:PK} = {REL:target}  
JOIN AurumPointOfService as POS ON {REL:source} = {POS:PK}}  
WHERE {POS:BASESTORE} is null  
ORDER BY {POS:NAME}

SELECT {P:CODE}  
FROM { PRODUCT AS P }  
WHERE {P:YOUMAYALSOLIKEENABLED} = 1

SELECT {P:CODE} 'Article Number'  
FROM { PRODUCT AS P  
JOIN PRODUCTTYPE AS PT ON {P:PRODUCTTYPE}={PT:PK}  
}  
WHERE {REQUIREORDERAPPROVAL} = 0  
AND {CODE} LIKE '4%'  
AND {CATALOGVERSION} = '8796125889113'  
/\* AND {P:MANUFACTURERNAME} LIKE '%Owned%'\*/ 

SELECT DISTINCT  
    {BS:NAME} AS 'Store Name',  
    {O:CODE} AS 'Order Number',  
    {O:DATE} AS 'Order Date',  
    {OS:NAME} AS 'Order Status',  
    {O:TOTALPRICE} AS 'Total Order Value',  
    MIN({P:CODE}) AS 'Article SKU',  
    MIN({OE:BASEPRICE}) AS 'Article Price',  
    MIN({P:MANUFACTURERNAME}) AS 'Article Brand',  
    {SA:CODE} AS 'Sales Application',  
    {O:DELIVERYMESSAGE} AS 'Delivery Message',  
    MIN({PT:PAYMENTPROVIDER}) AS 'Payment Provider',    
    MIN({PI:ADYENPAYMENTMETHOD}) AS 'Payment Method',  
    MAX({log.modifiedtime}) AS 'Approval Time'  
FROM  
    {ProcessTaskLog AS log  
    JOIN OrderProcess AS OP ON {log.process} = {[OP.pk](http://OP.pk)}  
    JOIN Order AS O ON {OP.order} = {[O.pk](http://O.pk)}  
    JOIN ORDERENTRY AS OE ON {OE.order} = {[O.pk](http://O.pk)}  
    JOIN PRODUCT AS P ON {OE.product} = {[P.pk](http://P.pk)}  
    JOIN BASESTORE AS BS ON {O:STORE} = {BS:PK}  
    JOIN ORDERSTATUS AS OS ON {O:STATUS} = {OS:PK}  
    LEFT JOIN PAYMENTTRANSACTION AS PT ON {O:PK} = {PT:ORDER}  
    LEFT JOIN PAYMENTINFO AS PI ON {PT:INFO} = {PI:PK}  
    JOIN SALESAPPLICATION AS SA ON {O:SALESAPPLICATION} = {SA:PK}  
    JOIN CURRENCY AS CU ON {O:CURRENCY} = {CU:PK}}  
WHERE  
    {log.actionId} = 'waitForOrderApproval'  
    AND {log.returnCode} = 'OK'  
    AND {O.date} \> '2024-11-21 00:00:00.0'  
    AND {CU:NAME} = 'Pound'  
    AND {PT:PAYMENTPROVIDER} != 'WOSG'  
GROUP BY  
    {BS:NAME}, {O:CODE}, {O:DATE}, {OS:NAME}, {O:TOTALPRICE},  
    {SA:CODE}, {O:DELIVERYMESSAGE}

SELECT DISTINCT {O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {BS:NAME} 'Store Name'  
FROM { ORDER AS O  
JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}  
JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}  
LEFT JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}  
LEFT JOIN PAYMENTINFO AS PI ON {PT:INFO}={PI:PK}  
LEFT JOIN ADDRESS AS DA ON {O:DELIVERYADDRESS}={DA:PK}  
LEFT JOIN REGION AS R ON {DA:REGION} = {R:PK}  
}  
WHERE {O:CODE} in ({{  
                   SELECT {O2:CODE} 'Order Number'  
					FROM { ORDER AS O2  
					JOIN PromotionResult AS PR ON {PR:ORDER} = {O2:PK}  
					JOIN RuleBasedPromotion AS RBP ON {PR:PROMOTION} = {RBP:PK}}  
					WHERE {RBP:CODE} IN ('GWPGiftCard250', 'GWPWatchWinderGiftCard')  
					GROUP BY {O2:CODE}  
					HAVING COUNT(\*) \>= 2  
                   }})

SELECT {o:code} 'Order', {o:customeremail} 'Email', {BS:NAME} 'Store Name'  
FROM {Order AS o  
JOIN Address AS a ON {o:paymentAddress} = {a:pk}  
JOIN AdyenPaymentInfo AS i ON {o:paymentinfo} = {i:pk}  
JOIN BASESTORE AS BS ON {o:STORE}={BS:PK}}  
WHERE {a:streetname} IS NOT NULL  
AND {a:streetnumber} IS NOT NULL  
AND {i:adyenPaymentMethodVariant} like '%applepay'  
AND {BS:NAME} = 'Mappin & Webb'  
AND {o.date} \>= '2024-10-23 00:00:00.0'

`SELECT {code}`

`FROM {order}`

`WHERE len({code}) > 10`

SELECT {c.uid} AS 'Email', {c.name} AS 'Customer Name', {wc.value} AS 'Credit', {cur.isocode}  
FROM { WOSGCredit AS wc  
JOIN Customer AS c ON {wc.customer} = {[c.pk](http://c.pk/)}  
JOIN Currency AS cur ON {wc.currency} = {[cur.pk](http://cur.pk/)}  
}  
WHERE {wc.value} \> 0

```
select {o:code}, count(*)
from {Order as o
join OrderEntry as oe on {oe:order} = {o:pk}
join Product as p on {oe:product} = {p:pk}}
where {oe:totalPrice} = 0
and {o.date} > '2026-01-01 00:00:00.0'
group by {o:code}
having count(*) > 1
```

```
select {o:code}, {p:code}, {oe:quantity}, {o:date} 'Order Date'
from {Order as o
join OrderEntry as oe on {oe:order} = {o:pk}
join Product as p on {oe:product} = {p:pk}}
where {oe:totalPrice} = 0
and {o.date} > '2026-01-01 00:00:00.0'
and {oe:quantity} > 1
```

SELECT  
  {c:uid}           AS Email,  
  {c:name}          AS CustomerName,  
  {c:creationtime}  AS Created,  
  CASE  
    WHEN {c:isverified} = 1 THEN 'Yes'  
    ELSE 'No'  
  END                AS Verified,  
  CASE  
    WHEN {c:TYPE} = '8796093055067'  THEN 'Registered'  
    WHEN {c:TYPE} = '879611175771'   THEN 'Guest'  
    ELSE 'Other'  
  END               AS CustomerType,  
  {bs:uid}          AS RegistrationSite  
FROM {Customer AS c  
LEFT JOIN BaseSite AS bs ON {c:registrationSite} = {bs:pk}}  
WHERE {c:uid} IN ('email')  
ORDER BY {c:creationtime} DESC

SELECT  
  temp.OrderNumber,  
  temp.OrderDate,  
  temp.CustomerEmail,  
  temp.CustomerName,  
  temp.BaseStoreName,  
  temp.SalesApplication,  
  temp.DeliveryMessage,  
  temp.ArticleNumber,  
  temp.TotalOrderValue,  
  (  
    DATEDIFF(  
      day,  
      temp.OrderDate,  
      GETDATE()  
    ) - temp.deliveryCount  
  ) AS DaysOverLeadTime  
FROM  
  (  
    {{  
    SELECT  
      {O : CODE} AS OrderNumber,  
      {O : DATE} AS OrderDate,  
      {C : UID} AS CustomerEmail,  
      {C : NAME} AS CustomerName,  
      {BS : NAME} AS BaseStoreName,  
      {SA : CODE} AS SalesApplication,  
      {O : DELIVERYMESSAGE} AS DeliveryMessage,  
	  {P:CODE} AS ArticleNumber,  
      CASE {O : DELIVERYMESSAGE} WHEN 'Next Day Delivery Delivery' THEN 1 WHEN '1-2 Days' THEN 2 WHEN 'Within 7 Days' THEN 7 WHEN '2-4 Weeks' THEN 28 WHEN '4-6 Weeks' THEN 42 WHEN '5-6 Weeks' THEN 42 WHEN '6-8 Weeks' THEN 56 WHEN '10-12 Weeks' THEN 84 END AS deliveryCount,  
      {O : TOTALPRICE} AS TotalOrderValue  
    FROM  
      { Order AS O  
      JOIN OrderStatus AS OS ON {O : STATUS} = {OS : PK}  
      JOIN BaseStore AS BS ON {O : STORE} = {BS : PK}  
      JOIN Customer AS C ON {O : USER} = {C : PK}  
    JOIN OrderEntry as OE on {OE : order} = {O:pk}  
	JOIN Product as P on {OE:product} = {P:pk}  
      LEFT JOIN SalesApplication AS SA ON {O : SALESAPPLICATION} = {SA : PK} }  
    WHERE  
      {O : DELIVERYMESSAGE} IS NOT NULL  
      AND {O : DATE} \>= DATEADD(  
        month,  
        -3,  
        GETDATE()  
      )  
      AND {OS : CODE} = 'APPROVED\_TRANSMITTED\_AWAITING\_DISPATCH'  
      AND {BS : NAME} IN (  
        'Goldsmiths', 'Mappin and webb',  
        'Watches Of Switzerland'  
      )  
      AND NOT EXISTS (  
        {{  
        SELECT  
          1  
        FROM  
          {Consignment AS CSG}  
        WHERE  
          {CSG : ORDER} = {O : PK}  
          AND {CSG : SHIPPINGDATE} IS NOT NULL }}  
      )  
      AND NOT EXISTS (  
        {{  
        SELECT  
          1  
        FROM  
          {ReturnRequest AS RR}  
        WHERE  
          {RR : ORDER} = {O : PK} }}  
      ) }}  
  ) temp  
WHERE  
  temp.deliveryCount IS NOT NULL  
  AND DATEDIFF(  
    day,  
    temp.OrderDate,  
    GETDATE()  
  ) \> temp.deliveryCount

SELECT  
  DISTINCT {c.uid} AS 'Email',  
  {c.name} AS 'Customer Name',  
  {c.creationtime} AS 'Date/Time Registered',  
  {s.name} AS 'Registration Site',  
  {ev.code} AS 'Social Sign In Provider',  
  {ss.userId} AS 'Social User ID'  
FROM  
  {Customer AS c  
  JOIN AurumSocialSignin AS ss ON {ss.customer} = {[c.pk](http://c.pk)}  
  JOIN EnumerationValue AS ev ON {ss.provider} = {[ev.pk](http://ev.pk)}  
  LEFT JOIN BaseSite AS s ON {[s.pk](http://s.pk)} = {c.registrationsite}}  
ORDER BY  
  {c.creationtime} DESC

SELECT  
    {c.uid}          AS 'Email',  
    {c.name}         AS 'Customer Name',  
    {c.creationtime} AS 'Date/Time Registered',  
    {s.name}         AS 'Registration Site',  
    {ev.code}        AS 'Social Sign In Provider',  
    {ss.userId}      AS 'Social User ID'  
FROM  
    {Customer AS c  
     LEFT JOIN BaseSite AS s ON {[s.pk](http://s.pk)} = {c.registrationsite}  
     JOIN CustomerType AS t ON {[t.pk](http://t.pk)} = {c.type}  
     LEFT JOIN AurumSocialSignin AS ss ON {ss.customer} = {[c.pk](http://c.pk)}  
     LEFT JOIN EnumerationValue AS ev ON {ss.provider} = {[ev.pk](http://ev.pk)}}  
WHERE  
    {c.creationtime} \>= '2026-03-18 00:00:00'  
    AND {t:code} = 'REGISTERED'  
    AND {s.name} IN (  
        'Watches Of Switzerland UK',  
        'Goldsmiths',  
        'Mappin and Webb'  
    )  
ORDER BY  
    {c.creationtime} DESC

SELECT  
  {o.code}       AS "Order Number",  
  {p.code}       AS "SKU",  
  {oe.basePrice} AS "Product Price"  
FROM {  
  OrderEntry AS oe  
  JOIN Product AS p ON {oe.product} = {[p.pk](http://p.pk)}  
  JOIN Order AS o ON {oe.order} = {[o.pk](http://o.pk)}  
}  
WHERE  
  {o.creationtime} \>= '2026-04-07 00:00:00'  
  AND {o.creationtime} \<  '2026-05-05 00:00:00'  
  AND {p.code} IN (  
    '39260019',  
    '39260015',  
    '39260020',  
    '39310007',  
    '39310008',  
    '39310006',  
    '39310004',  
    '39310003'  
  )  
ORDER BY {o.code}

---

SELECT  
  {o.code}          AS OrderNumber,  
  {os.name}         AS OrderStatus,  
  {p.code}          AS ProductCode,  
  {oe.quantity}     AS Quantity,  
  {o.creationtime}  AS OrderDate  
FROM  
{  
  OrderEntry AS oe  
  JOIN Product AS p ON {oe.product} = {[p.pk](http://p.pk)}  
  JOIN Order AS o ON {oe.order} = {[o.pk](http://o.pk)}  
  JOIN OrderStatus AS os ON {o.status} = {[os.pk](http://os.pk)}  
}  
WHERE  
  {o.creationtime} \>= '2026-04-07 00:00:00'  
  AND {o.creationtime} \< '2026-08-08 00:00:00'  
  AND {p.code} IN ('12111152')  
ORDER BY {o.code}

SELECT  
  {pos.name},  
  {pos.displayName} AS 'Display Name',  
  {pos.name4} AS 'Name 4',  
  {bs.uid}  
FROM {AurumPointOfService AS pos JOIN BaseStore AS bs ON {pos.baseStore} = {[bs.pk](http://bs.pk)}}  
WHERE {pos.baseStore} IS NOT NULL  
AND {bs.name} IN ('Goldsmiths', 'Mappin & Webb', 'Watches Of Switzerland')  
AND {pos.isClickAndCollectEnabled} = 1  
ORDER BY {bs.name}, {pos.name}

```
SELECT DISTINCT {BS:NAME} 'Store Name', {O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {O:TOTALPRICE} 'Total Order Value',{CT:CODE} 'Consignment Status', {C:shippingDate} 'Consignment Shipped',{P:CODE} 'Article SKU',{OE:BASEPRICE} 'Article Price', {P:MANUFACTURERNAME} 'Article Brand', {SA:CODE} 'Sales Application', {O:DELIVERYMESSAGE} 'Delivery Message', {C:TRACKINGID} 'Tracking ID', {PT:PAYMENTPROVIDER} 'Payment Provider',  {PI:ADYENPAYMENTMETHOD} 'Payment Method'
FROM { ORDERENTRY AS OE
JOIN ORDER AS O ON {OE:ORDER}={O:PK}
JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}
JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}
LEFT JOIN CONSIGNMENT AS C ON {O:PK}={C:ORDER}
LEFT JOIN CONSIGNMENTSTATUS AS CT ON {C:STATUS}={CT:PK}
JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}
JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}
JOIN PAYMENTINFO AS PI ON {PT:INFO}={PI:PK}
JOIN SALESAPPLICATION AS SA ON {O:SALESAPPLICATION} = {SA:PK}
}
WHERE {O:DELIVERYMESSAGE} IN ('6-8 Weeks non-refundable')
```

```sql
select {p:code},
({{ select count(*) from {StockLevel as sl} where {sl:productCode} = {p:code} }})
from {Product as p}
where {p:catalogVersion} = 8796125889113
and {p:code} in ('12010639','12050695','12052878','12920183','12920906','17250521','17250523','17304229','17305525','17305817','17311143','17311715','17531891','17532697','17640756','17640791','17640792','17640795','17640795','17640797','17640826','17640909','17640909','17640918','17640923','17640936','17640939','17640987','17640993','17641004','17641038','17641098','17641100','17641101','17641102','17641103','17641104','17641105','17641106','17641107','17641109','17641110','17641111','17641111','17641112','17641113','17641114','17641115','17641115','17641119','17770448','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770569','17770571','17770766','17770767','17770768','17770768','17770775','17770775','17770775','17770776','17770777','17770778','17770778','17770778','17770778','17770778','17770781','17770781','17770782','17770782','17770786','17770786','17770786','17770787','17770787','17770788','17770789','17770790','17770790','17770790','17770790','17770790','17770790','17770790','17770790','17770790','17770793','17770798','17770798','17770798','17770798','17770804','17770886','17770891','17770903','17770937','17770937','17770937','17770945','17770946','17771017','17771017','17771029','17771029','18800109','18800109','18800158','18800158','18980178','18981234','22260180','22260317','37341257','37342317','37521485','37521764','37521764','37521764','37521764','37521764','37521764','37522262','37522401','37522719','37523589','37523592','37523593','37523593','37523593','37523593','37523593','37523593','37523593','37523831','37524867','37524867','37524867','37524868','37524868','37524868','37640681','37711879','37711879','37711879','37711879','37711970','37711970','37711970','37711970','39130175','39130176','39131750','39260017','39260133','39260396','39260397','40060073','40060183','40070072','40070081','40181872','40181882','40410211','40410331','40410340','40410349','40410350','40410351','40614930','40619652','40922928','40922929','40922930','40950550','40950551','40992837','40993004','40993006','40993096','40993097','40993098','40993099','40993100','40993101','40993102','40993200','40993200','40993201','40993202','40993203','40993204','40993205','40993206','40993207','40993208','40993209','40993210','40993211','40993212','40993213','40993214','40993215','40993216','40993217','40993218','40993219','40993220','40993221','40993222','40993223','40993224','40993227','40993228','40993229','40993230','40993231','40993232','40993233','40993234','40993235','40993236','40993237','40993238','40993239','40993240','40993241','40993242','40993243','40993244','40993245','40993247','40993248','40993250','40993251','40993252','40993253','40993254','40993255','40993256','40993257','40993258','40993259','40993260','40993261','40993262','40993263','40993264','40993265','40993266','40993267','40993268','40993269','40993270','40993272','40993273','40993274','40993275','40993276','40993277','40993278','40993279','40993280','25050041529','25050041531','408100178490','408100180490')
order by {p:code}
```

SELECT  
  {p : code},  
  {pr : pk},  
  {pr : kappl},  
  {pr : knumh},  
  {pr : kotabnr},  
  {pr : kschl},  
  {pr : kvewe},  
  {pr : pltyp},  
  {pr : priceRowLastModifiedDts},  
  {pr : salePrice},  
  {pr : vkorg},  
  {pr : vtweg},  
  {pr : werks},  
  {pr : price},  
  {pr : currency},  
  {pr : net},  
  {pr : unit},  
  {pr : unitFactor},  
  {pr : minqtd},  
  {pr : startTime},  
  {pr : endTime},  
  {pr : pg},  
  {pr : channel},  
  {pr : sequenceId},  
  {pr : ug},  
  {pr : user},  
  {pr : productId},  
  {pr : matchValue},  
  {pr : userMatchQualifier},  
  {pr : productMatchQualifier},  
  {pr : giveAwayPrice},  
  {pr : sealed},  
  {pr : catalogVersion},  
  {pr : creationtime},  
  {pr : modifiedtime},  
  {pr : owner}  
FROM  
  {Product AS p  
  JOIN AurumPriceRow AS pr ON {pr : product} = {p : pk}  
  JOIN CatalogVersion AS cv ON {pr : catalogVersion} = {cv : pk}  
  JOIN Catalog AS c ON {cv : catalog} = {c : pk}}  
WHERE  
  {c : id} = 'masterProductCatalog'  
  AND {p : code} = '17330963'  
  AND {pr : vkorg} = 'GS01'  
  AND {pr : kschl} IN ('VKP0', 'VKA0')  
  AND {pr : net} = 0  
  AND (  
    {pr : startTime} IS NULL  
    OR {pr : startTime} \<= '2026-08-08 00:00:00'  
  )  
  AND (  
    {pr : endTime} IS NULL  
    OR {pr : endTime} \>= '2026-08-08 00:00:00'  
  )

SELECT  
  {o : code} AS 'Order No',  
  {o : date} AS 'Order Date',  
  {bs : name} AS 'Store',  
  {cur : isocode} AS 'Currency',  
  {o : totalprice} AS 'Order Value',  
  (  
    CASE WHEN {c : type} = '8796093055067' THEN 'Registered' WHEN {c : type} = '8796111175771' THEN 'Guest' ELSE 'Other' END  
  ) AS 'Customer Type',  
  (  
    CASE WHEN {c : type} = '8796111175771' THEN 'N/A (Guest)' WHEN {ev : code} IS NOT NULL THEN {ev : code} ELSE 'Standard (Email/Password)' END  
  ) AS 'Registration Method',  
  {rs : name} AS 'Registration Site'  
FROM  
  {Order AS o  
  JOIN User AS u ON {u : pk} = {o : user}  
  JOIN Customer AS c ON {c : uid} = {u : uid}  
  LEFT JOIN BaseStore AS bs ON {bs : pk} = {o : store}  
  LEFT JOIN Currency AS cur ON {cur : pk} = {o : currency}  
  LEFT JOIN BaseSite AS rs ON {rs : pk} = {c : registrationsite}  
  LEFT JOIN AurumSocialSignin AS ss ON {ss : customer} = {c : pk}  
  LEFT JOIN EnumerationValue AS ev ON {ev : pk} = {ss : provider}  
WHERE  
  {o : date} \>= '2026-07-28 08:30:00'  
  AND {o : date} \< '2026-07-30 08:30:00'  
  AND {cur : name} = 'Pound'  
ORDER BY  
  {o : date} DESC

SELECT DISTINCT {C:UID} 'Email', {O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {CT:CODE} 'Consignment Status', {P:CODE} 'Article SKU',{OE:BASEPRICE} 'Article Price', {P:MANUFACTURERNAME} 'Article Brand', {SA:CODE} 'Sales Application', {O:DELIVERYMESSAGE} 'Delivery Message', {PTY:CODE} 'Product Type', {PS:NAME} 'Payment Status', {O:TOTALPRICE} 'Total Price', {DM:NAME} 'Delivery Mode', {PT:PAYMENTPROVIDER} 'Payment Provider',  
({{  
SELECT STRING\_AGG({pm:CODE}, ', ')  
FROM {PaymentMethodsForOrder AS pmo  
JOIN PaymentMethod AS pm ON {pmo:SOURCE} = {pm:PK}}  
WHERE {pmo:TARGET} = {O:PK}  
}}) AS 'Payment Methods'  
FROM { ORDERENTRY AS OE  
JOIN ORDER AS O ON {OE:ORDER}={O:PK}  
JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}  
JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}  
LEFT JOIN CONSIGNMENT AS C ON {O:PK}={C:ORDER}  
LEFT JOIN CONSIGNMENTSTATUS AS CT ON {C:STATUS}={CT:PK}  
JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}  
JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}  
JOIN PAYMENTINFO AS PI ON {PT:INFO}={PI:PK}  
JOIN SALESAPPLICATION AS SA ON {O:SALESAPPLICATION} = {SA:PK}  
JOIN PRODUCTTYPE AS PTY ON {P:PRODUCTTYPE}={PTY:PK}  
JOIN USER AS U ON {U:PK} = {O:USER}  
JOIN CUSTOMER as C on {C:UID} = {U:UID}  
LEFT JOIN PAYMENTSTATUS as PS on {O:PAYMENTSTATUS}={PS:PK}  
LEFT JOIN Currency AS cur ON {cur:pk} = {O:currency}  
LEFT JOIN DeliveryMode AS DM ON {O:deliveryMode}={DM:PK}  
}  
WHERE  
 {O:date} \>= '2025-01-05 01:00:00'  
 AND {O:date} \< '2026-08-20 11:00:00'  
 AND {cur:name} = 'Pound'

### SQL

SELECT \* FROM processes

where p\_processdefinitionname = 'sendPaymentLinkEmailProcess'

and p\_customer = '8833077673988'

SELECT item\_t0.createdTS 'Date', item\_t0.p\_code 'Order Number' , item\_t0.p\_totalprice 'Order Total' , item\_t1.p\_lastname 'Boutique'  FROM orders item\_t0 JOIN addresses item\_t1 ON  item\_t0.p\_deliveryaddress = item\_t1.PK  WHERE item\_t1.p\_lastname IN (SELECT item\_t3.p\_displayName FROM pointofservice item\_t3 WHERE (item\_t3.p\_zwktyp NOT IN ('GOLD', 'M&W', 'WOS', 'MAY', 'BET', '')) AND (item\_t3.p\_isclickandcollectenabled = TRUE)) AND item\_t0.createdTS \> '2023-09-04'

Looks at the Last name given in the delivery address associated to the order (monobrand store address clone) and matches that against the display name given in POS as these values match.

SELECT  
  createdTS AS 'Time created',  
  PK AS 'PK',  
  p\_code AS 'Process code',  
  p\_endmessage AS 'Message',  
  CASE p\_currency  
    WHEN 8796093186081 THEN 'UK'  
    WHEN 8796093120545 THEN 'US'  
  END AS 'Country'  
FROM processes  
WHERE p\_processdefinitionname = 'forgottenPasswordProcess'  
  AND createdTS \>= '2026-03-18 00:00:00';

## Hybris - May need altering (table names etc.)

### Flexisearch


SELECT DISTINCT {O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {BS:NAME} 'Store Name', {DA:firstname} 'First Name',  {DA:lastname} 'Last Name', {DA:STREETNUMBER} 'Address 1', {DA:STREETNAME} 'Address 2', {DA:APPARTMENT} 'Address 3', {DA:TOWN} 'City', {R:NAME} 'State', {DA:POSTALCODE} 'Postal', {DA:PHONE1} 'Phone', {O:CUSTOMEREMAIL} 'Email', {P:CODE} 'Article SKU', {OE:QUANTITY} 'Quantity' ,{PI:ADYENPAYMENTMETHOD} 'Payment Method'  
FROM { ORDERENTRY AS OE  
JOIN ORDER AS O ON {OE:ORDER}={O:PK}  
JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}  
JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}  
JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}  
JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}  
JOIN PAYMENTINFO AS PI ON {PT:INFO}={PI:PK}  
JOIN ADDRESS AS DA ON {O:DELIVERYADDRESS}={DA:PK}  
JOIN REGION AS R ON {DA:REGION} = {R:PK}  
}  
WHERE {P:CODE} = '18550144'


SELECT DISTINCT  
  {o:code} AS "Order Number",  
  {o:date} AS "Order Date"  
FROM {  
  OrderEntry AS oe  
  JOIN Order   AS o ON {oe:order}   = {o:pk}  
  JOIN Product AS p ON {oe:product} = {p:pk}  
}  
WHERE {p:code} = '17382029'  
ORDER BY {o:date} DESC

SELECT {PPI:TRANSACTIONID} 'Transaction Id', {O:DATE} 'Date', {O:CODE} 'Order Number', {O:TOTALPRICE} 'Total Price'

FROM {ORDER AS O 

JOIN PAYMENTMODE AS PM ON {O:PAYMENTMODE}={PM:PK}

JOIN PAYPALPAYMENTINFO AS PPI ON {O:OTHERPAYMENTINFO}={PPI:PK}

}

WHERE {PM:CODE}='PayPal' AND {PPI:TRANSACTIONID} IN (\<\<insert transaction id's here\>\>)

SELECT {BS:NAME} 'Store Name', {O:DATE} 'Date', {O:CODE} 'Order Number', {OE:BASEPRICE} 'Article Price', {P:CODE} 'Article SKU', {P:MANUFACTURERNAME} 'Brand' ,{DELADD:POSTALCODE} 'Delivery Post Code'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN ADDRESS AS DELADD ON {O:DELIVERYADDRESS}={DELADD:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

}

WHERE {OS:NAME}='Completed' and {O:DATE} \>= '2016-08-01' AND {O:DATE} \<= '2016-08-15'

SELECT {BS:NAME} 'Store Name', {O:DATE} 'Date', {O:CODE} 'Order Number', {OE:BASEPRICE} 'Article Price', {P:CODE} 'Article SKU', {P:MANUFACTURERNAME} 'Brand' ,{DELADD:POSTALCODE} 'Delivery Post Code'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN ADDRESS AS DELADD ON {O:DELIVERYADDRESS}={DELADD:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

}

WHERE {P:CODE}='06070885160' and {O:DATE} \>= '2017-11-01' AND {O:DATE} \<= '2017-12-05'

SELECT {BS:NAME} 'Store Name', {O:DATE} 'Date', SUM({OE:QUANTITY}) 'Total Qty', {O:CODE} 'Order Number', {O:TOTALPRICE} 'Total Price', {DELADD:POSTALCODE} 'Delivery Post Code'

FROM {ORDER AS O 

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ADDRESS AS DELADD ON {O:DELIVERYADDRESS}={DELADD:PK}

JOIN ORDERENTRY AS OE ON {OE:ORDER}={O:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

}

WHERE {OS:NAME}='Completed' and {O:DATE} \>= '2016-08-01' AND {O:DATE} \<= '2016-08-15'

group by {OE:ORDER}, {O:DATE}

SELECT {BS:NAME} 'Store Name', {O:DATE} 'Date', SUM({OE:QUANTITY}) 'Total Qty', {O:CODE} 'Order Number', {O:TOTALPRICE} 'Total Price', {DELADD:POSTALCODE} 'Delivery Post Code', {PM:CODE} 'Payment Mode'

FROM {ORDER AS O 

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ADDRESS AS DELADD ON {O:DELIVERYADDRESS}={DELADD:PK}

JOIN ORDERENTRY AS OE ON {OE:ORDER}={O:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PAYMENTMODE AS PM ON {O:PAYMENTMODE}={PM:PK}

}

WHERE {OS:NAME}='Completed' and {O:DATE} \>= '2016-08-01' AND {O:DATE} \<= '2016-08-15'

group by {OE:ORDER}, {O:DATE}

select {code}, {totalprice} from {Order} where {Code} in ('GBXXXXXXXX', 'GBXXXXXXXX') 

select {o.code}, {u.uid} from {order AS o JOIN user AS u on {u.pk} = {o.user}}

where {o.code} in ('GBB0001032','GBB0001031','GBB0001030')

---

*Example results:*  
***Code                UniqueID***

*GBB0001030      7c1b4e9313d42ced535df1be05117570965bf157@btinternet.com-\_-goldsmithsboutique*

*GBB0001030      7c1b4e9313d42ced535df1be05117570965bf157@btinternet.com-\_-goldsmithsboutique*

select {o.code}, {u.aurumEmail}, {u.phone}, {o.totalprice} from 

{Order as o join AurumCustomer  as u on {u.pk} = {o.user}} 

where {o.code} in ('GBXXXXXXXX', 'GBXXXXXXXX') 

GROUP BY {o.code}

select {o.code}, {u.aurumEmail}, {u.phone}, {u.mobile}, {o.totalprice} from 

{Order as o join AurumCustomer  as u on {u.pk} = {o.user}} 

where {o.code} in ('GBXXXXXXXX', 'GBXXXXXXXX') 

GROUP BY {o.code}

select {o.code}, {u.name}, {u.phone}, {u.mobile}, {o.totalprice} 

from {Order as o 

join AurumCustomer as u on {u.pk} = {o.user}} 

where {o.code} in ('GBGxxxxxxx', 'GBGxxxxxxx' ) 

GROUP BY {o.code}

select count(\*) 

from {product} 

where ({showIBCPaymentOptionOnGoldsmiths} is null OR  {showIBCPaymentOptionOnBoutique} is null OR {showIBCPaymentOptionOnMappinAndWebb} is null OR {showIBCPaymentOptionOnWatchesOfSwitzerland} is null) and {CatalogVersion} = '8796093153881'


**With date range:**

select {o.code} AS 'Order number', {v.code} AS 'Consumer Finance Number' 

from {Order as o 

JOIN PaymentMode as p ON {o.paymentMode} = {p.pk} and {p.code} = 'V12IFCDeposit'

JOIN V12IFCPaymentInfo as v ON {o.paymentInfo} = {v.pk}}

where {o.date} \> '2017-07-01' and {o.date} \< '2017-08-02'

---

**With given orders:**

select {o.code} AS 'Order number', {v.code} AS 'Consumer Finance Number' 

from {Order as o 

JOIN PaymentMode as p ON {o.paymentMode} = {p.pk} and {p.code} = 'V12IFCDeposit'

JOIN V12IFCPaymentInfo as v ON {o.paymentInfo} = {v.pk}} 

WHERE {o.code} IN ('GBGXXXXXXX', 'GBGXXXXXXX')

select {o.code}, {u.uid} from {order AS o JOIN user AS u on {u.pk} = {o.user}}

where {o.code} in ('GBB0001032','GBB0001031','GBB0001030'

SELECT {O:CODE} 'Order Number', {O:DATE} 'Date', {O:TOTALPRICE} 'Total Price', {PM:CODE} 'Payment Mode', {V:CODE} 'Vendor', {OS:NAME} 'Order Status'

FROM { ORDER AS O 

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN VENDOR AS V ON {O:CHOSENVENDOR}={V:PK}

JOIN PAYMENTMODE AS PM ON {O:PAYMENTMODE}={PM:PK}

}

WHERE {O:CODE} IN ('GBXXXXXXXX', 'GBXXXXXXXX')

SELECT {O:CODE} 'Order Number', {BA:POSTALCODE} 'Billing Post Code', {BA:phone1} 'Billing Telephone', {BA:firstname} 'Billing FirstName',  {BA:lastname} 'Billing LastName'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN ADDRESS AS BA ON {O:PAYMENTADDRESS}={BA:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

}

WHERE {O:DATE} \>= '2016-08-01' AND {O:DATE} \<= '2016-08-15'

SELECT {O:CODE} 'Order Number', {O:DATE} 'Date', {O:TOTALPRICE} 'Total Price', {PM:CODE} 'Payment Mode', {BA:POSTALCODE} 'Billing Post Code', {BA:firstname} 'Billing FirstName',  {BA:lastname} 'Billing LastName'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN ADDRESS AS BA ON {O:PAYMENTADDRESS}={BA:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

D

}

WHERE {BA:POSTALCODE} = "ME14 1Qp" and {O:DATE} \>= '2017-11-01' AND {O:DATE} \<= '2017-12-04'

SELECT {O:CODE} 'Order Number', {O:DATE} 'Date', {O:TOTALPRICE} 'Total Price', {O:deliveryMode} 'Delivery Mode', {V:CODE} 'Vendor', {PM:CODE} 'Payment Mode',  {OS:NAME} 'Order Status', {BA:POSTALCODE} 'Billing Post Code', {BA:firstname} 'Billing FirstName',  {BA:lastname} 'Billing LastName'

FROM {ORDER AS O 

JOIN ADDRESS AS BA ON {O:PAYMENTADDRESS}={BA:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PAYMENTMODE AS PM ON {O:PAYMENTMODE}={PM:PK}

JOIN VENDOR AS V ON {O:CHOSENVENDOR}={V:PK}

}

WHERE {BA:POSTALCODE} is not null and {O:DATE} \>= '2017-08-01' and {O:kioskDistributionChannel} = TRUE and {O:deliveryType} = "8796122218587"

SELECT {O:DATE} 'Date', {O:CODE} 'Order Number', {O:TOTALPRICE} 'Total Price',{PTE:RequestID} 'RequestID'

FROM {PAYMENTTRANSACTIONENTRY AS PTE

JOIN PAYMENTTRANSACTION AS PT ON {PT:PK}={PTE:PAYMENTTRANSACTION}

JOIN ORDER AS O ON {O:PK}={PT:ORDER}

}

WHERE {O:CODE} IN ('GBXXXXXXXXX','GBXXXXXXXXX')

SELECT DISTINCT {P:Code} 'Code', {P2:Code} 'Master Code'

FROM {

RingMetalTypeStoneWeightVariantProduct AS P

JOIN PRODUCT AS P2 ON {P:BASEPRODUCT} = {P2:PK} 

}

WHERE {P:CODE} IN ('XXXXXXXX', 'XXXXXXXX')

SELECT {O:CODE} 'Order Number', {O:DATE} 'Order Date', {O:TOTALPRICE} 'Total Order Value',{CT:CODE} 'Consignment Status', {C:shippingDate} 'Consignment Shipped'

FROM {ORDER AS O 

JOIN CONSIGNMENT AS C ON {O:PK}={C:ORDER} 

JOIN CONSIGNMENTSTATUS AS CT ON {C:STATUS}={CT:PK}} 

WHERE {O:DATE} \>= '2017-11-28' AND {O:DATE} \<= '2017-12-23'

SELECT {cv.pk}, {c.ID}, {cv.version}

FROM {Catalog as c

JOIN CatalogVersion as cv

ON {cv.catalog} = {c.pk}}

SELECT {WP:CODE} 'Article Number', {PR:PRICE} 'Current Retail Price', {P:CREATIONTIME} 'Creation Date', {C:ID} 'Catalog'

FROM { PRODUCT AS P

JOIN WATCHPRODUCT AS WP ON {P:PK}={WP:PK}

JOIN PRICEROW AS PR ON {P:PK}={PR:PRODUCT}

JOIN CATALOG AS C ON {PR:CATALOGVERSION}={C:ACTIVECATALOGVERSION}}

WHERE {WP:CODE} LIKE '40%'

AND {PR:CATALOGVERSION} = '8796093153881'

SELECT {O:CODE} 'Order Number', {RE:REFUNDEDDATE} 'Refunded Date', {RE:REFUNDAMOUNT} 'Refund Amount', {RR:CODE} 'Refund Reason', {RRE:REFUNDINGCSAGENT} 'Refunding CS Agent'

FROM { RefundEntry AS RE 

JOIN REFUNDREASON AS RR ON {RE:REASON}={RR:PK}

JOIN ORDERENTRY AS OE ON {RE:ORDERENTRY}={OE:PK}

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN RETURNREQUEST AS RRE ON {RE:RETURNREQUEST}={RRE:PK}

}

WHERE {RR:CODE}= 'Chargeback'

AND {RE:REFUNDEDDATE} \>= '2017-01-01'

AND {RE:REFUNDEDDATE} \<= '2018-05-01'

SELECT {OCRE:CODE} 'Order Number', {OCRE:CANCELREASON} 'Cancel Reason', {OCRE:TIMESTAMP} 'Date of Cancellation'

FROM { ORDERCANCELRECORDENTRY AS OCRE }

WHERE {OCRE:TIMESTAMP} \>= '2017-01-01'

AND {OCRE:TIMESTAMP} \<= '2018-05-01'

AND {OCRE:CANCELREASON} = '8796109832283'

OR {OCRE:CANCELREASON} = '8796109865051'

SELECT {BS:NAME} 'Store Name', {O:DATE} 'Date', {O:CODE} 'Order Number', {OE:BASEPRICE} 'Article Price', {P:CODE} 'Article SKU', {P:MANUFACTURERNAME} 'Brand' ,{DELADD:POSTALCODE} 'Delivery Post Code'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN ADDRESS AS DELADD ON {O:DELIVERYADDRESS}={DELADD:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

}

WHERE {OS:NAME}='Completed' and {O:DATE} \>= '2016-01-01' AND {O:DATE} \<= '2016-04-12'

SELECT {O:CODE},  {O:PROCESSINGNODEID}  FROM {ORDER AS O} WHERE {O:CODE} IN ('GBXXXXXXXX', 'GBXXXXXXXX')

SELECT COUNT(\*)

FROM { ORDER AS O 

}

WHERE {O:csAgent} is not null AND {O:DATE} \>= '2017-05-01' AND {O:DATE} \<= '2018-04-30'

SELECT COUNT(\*)

FROM { ORDER AS O 

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

}

WHERE {O:csAgent} is not null AND {O:DATE} \>= '2017-05-01' AND {O:DATE} \<= '2018-04-30' AND {OS:NAME}='Completed'

SELECT SUM(TOTALPRICE)

FROM {ORDER AS O}

WHERE {O:csAgent} is not null AND {O:DATE} \>= '2017-05-01' AND {O:DATE} \<= '2018-04-30'

SELECT SUM(TOTALPRICE)

FROM { ORDER AS O 

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

}

WHERE {O:csAgent} is not null AND {O:DATE} \>= '2017-05-01' AND {O:DATE} \<= '2018-04-30' AND {OS:NAME}='Completed'

SELECT {BS:NAME} 'Store Name', {O:CODE} 'Order Number', {O:DATE} 'Order Date', {OS:NAME} 'Order Status', {A:SHIPPINGADDRESS} 'Shipping Address', {A:BILLINGADDRESS} 'Billing Address', {PM:CODE} 'Payment Type', {A:PHONE1} 'Phone Number', {O:CSAGENT} 'Agent'

FROM {ORDER AS O 

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN ADDRESS AS A ON {O:PAYMENTADDRESS}={A:PK} OR {O:DELIVERYADDRESS}={A:PK}

JOIN PAYMENTMODE AS PM ON {O:PAYMENTMODE}={PM:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}} 

WHERE {O:DATE} \>= '2019-08-01' AND {O:DATE} \<= '2019-09-16' 

AND {O:kioskDistributionChannel} = FALSE

AND {OS:NAME} = 'Completed'

SELECT {BS:NAME} 'Store Name', {O:DATE} 'Date', {O:CODE} 'Order Status', {P:CODE} 'Article SKU', {PM:CODE} 'Payment Mode', {PT:PAYMENTPROVIDER} 'Payment Provider', {OE:QUANTITY} 'Quantity'

FROM { ORDERENTRY AS OE

JOIN ORDER AS O ON {OE:ORDER}={O:PK}

JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}

JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}

JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}

JOIN PAYMENTMODE AS PM ON {O:PAYMENTMODE}={PM:PK}

JOIN PAYMENTTRANSACTION AS PT ON {O:PK}={PT:ORDER}}

WHERE {O:DATE} \>= '2019-08-21' AND {O:DATE} \<= '2019-09-20'

AND {BS:NAME} = 'Goldsmiths Online Store'

AND {PM:CODE} \<\> 'V12IFCDeposit'

AND {PM:CODE} \<\> 'V12IBCDeposit'

AND {P:CODE} NOT IN ('39260124', '39260123', '39260122', '39030118')

AND {OS:NAME}='Completed' 

ORDER BY {O:DATE}, {OE:PK}

SELECT {o.code}, {ac.name}, {ac.phone}, {ac.mobile}, {o.totalprice}, {o.user}, {ac.aurumemail}  
FROM {Order as o  
JOIN AurumCustomer as ac on {ac.pk} = {o.user}}  
where {ac.aurumemail} IN ('')

SELECT {WP:CODE} 'Article Number', {PR:PRICE} 'Current Retail Price', {P:CREATIONTIME} 'Creation Date', {C:ID} 'Catalog'

FROM { PRODUCT AS P

JOIN WATCHPRODUCT AS WP ON {P:PK}={WP:PK}

JOIN PRICEROW AS PR ON {P:PK}={PR:PRODUCT}

JOIN CATALOG AS C ON {PR:CATALOGVERSION}={C:ACTIVECATALOGVERSION}}

WHERE {P:CREATIONTIME} \>= '2020-08-01'

AND {PR:CATALOGVERSION} = '8796093153881'

AND {PR:PRICE} \>= '1000.0'

SELECT {O:DATE} 'Date', {C:SHIPPINGDATE} 'Shipped Date', {P:MANUFACTURERNAME} 'Brand', {OE:QUANTITY} 'Quantity', {P:CODE} 'Article SKU', {P:NAME} 'Article Title', {O:TOTALPRICE} 'Total Price (Tax Excluded)', {O:TOTALTAX} 'Tax',  {O:CODE} 'Order Number', {AD:TOWN} 'Town', {R:ISOCODE} 'State', {OS:NAME} 'Order Status'  
FROM { ORDERENTRY AS OE  
JOIN ORDER AS O ON {OE:ORDER}={O:PK}  
JOIN BASESTORE AS BS ON {O:STORE}={BS:PK}  
JOIN ORDERSTATUS AS OS ON {O:STATUS}={OS:PK}  
JOIN PRODUCT AS P ON {OE:PRODUCT}={P:PK}  
JOIN CONSIGNMENT AS C ON {O:PK}={C:ORDER}  
JOIN CONSIGNMENTSTATUS AS CT ON {C:STATUS}={CT:PK}  
JOIN ADDRESS AS AD ON {O:DELIVERYADDRESS}={AD:PK}  
JOIN REGION AS R ON {AD:REGION}={R:PK}  
}  
WHERE {O:DATE} \>= '2021-01-31' AND {O:DATE} \<= '2021-02-13'

INSERT\_UPDATE Consignment;order(code)\[unique=true\];TrackingID  
;GBB0001032;00000000000

SELECT {C:NAME} 'Customer Name', {ev1:code} 'Customer Type', {C:CREATIONTIME} 'Registered Time', {L:ISOCODE} 'Country', {C:ISVERIFIED} 'Is Verified'  
FROM { CUSTOMER AS C  
JOIN EnumerationValue AS ev1 ON {C:TYPE}={ev1:PK}  
JOIN LANGUAGE AS L ON {C:SESSIONLANGUAGE}={L:PK}  
}  
WHERE {ev1:code} = 'REGISTERED'  
AND {C:CREATIONTIME} \>= '2023-01-30' AND {C:CREATIONTIME} \<= '2023-02-06'

**Checks orders with multiple GWP lines**

```
SELECT
    {o:code}              AS p_code,
    {os:code}             AS p_status,
    {ps:code}             AS p_paymentstatus,
    COUNT(*)              AS entry_count
FROM {
    Order           AS o
    JOIN OrderEntry AS oe ON {oe:order} = {o:pk}
    JOIN Product    AS p  ON {oe:product} = {p:pk}
    JOIN EnumerationValue AS os ON {o:status} = {os:pk}
    JOIN EnumerationValue AS ps ON {o:paymentStatus} = {ps:pk}
}
WHERE {oe:totalPrice} = 0
  AND {o:date} > '2026-01-01 00:00:00.0'
GROUP BY
    {o:code},
    {os:code},
    {ps:code}
HAVING COUNT(*) > 1
```

**Checks for 1 GWP line with multiple quantity**

```
SELECT
    {o:code}        AS order_code,
    {os:code}       AS order_status,
    {ps:code}       AS payment_status,
    {p:code}        AS product_code,
    {oe:quantity}   AS quantity
FROM {
    Order               AS o
    JOIN OrderEntry     AS oe ON {oe:order} = {o:pk}
    JOIN Product        AS p  ON {oe:product} = {p:pk}
    JOIN EnumerationValue AS os ON {o:status} = {os:pk}
    JOIN EnumerationValue AS ps ON {o:paymentStatus} = {ps:pk}
}
WHERE {oe:totalPrice} = 0
  AND {o:date} > '2026-01-01 00:00:00.0'
  AND {oe:quantity} > 1
```
