/* Excel dışa aktarma: panelin görünümünü koruyan .xlsx üretir (ExcelJS). */
function buildWorkbook(ExcelJS, S, todayStr){
  const C={ink:'FF111111',acc:'FFFF5A36',accInk:'FFC2361A',soft:'FFF2F2F2',line:'FFE6E6E6',mut:'FF767676',white:'FFFFFFFF'};
  const F='Arial', solid=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
  const LBL={bekliyor:'Bekliyor',devam:'Devam',bitti:'Bitti',engel:'Engel var'};
  const dt=s=>{ if(!s) return null; const [y,m,d]=s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); };
  const n=v=>{ if(v===''||v==null) return null; const x=parseFloat(String(v).replace(/\./g,'').replace(',','.')); return isNaN(x)?null:x; };
  const money='#,##0 "₺";-#,##0 "₺";"—"';
  const wb=new ExcelJS.Workbook(); wb.creator='Origin Kuruluş Takibi'; wb.created=new Date();
  const ws=wb.addWorksheet('Takip',{properties:{defaultRowHeight:20},views:[{showGridLines:false}],
    pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2}}});
  ws.columns=[{key:'a',width:14},{key:'b',width:58},{key:'c',width:20},{key:'d',width:13},{key:'e',width:13},{key:'f',width:15},{key:'g',width:15},{key:'h',width:15},{key:'i',width:46}];
  ws.headerFooter.oddFooter='&L'+(S.title||'Origin')+'&RSayfa &P / &N';
  ws.mergeCells('A1:I1'); const t=ws.getCell('A1'); t.value=S.title||'Origin Üretim Merkezi'; t.font={name:F,size:22,bold:true,color:{argb:C.ink}}; ws.getRow(1).height=34;
  ws.mergeCells('A2:I2'); const st=ws.getCell('A2'); st.value=(S.sub||'')+'   ·   Dışa aktarım: '+todayStr.split('-').reverse().join('.'); st.font={name:F,size:10,color:{argb:C.mut}};
  const first=7; let r=first; const ranges=[];
  S.phases.forEach((p,i)=>{
    ws.mergeCells(`A${r}:G${r}`); const ph=ws.getCell(`A${r}`); ph.value=`${i+1}   ${p.name}`;
    ws.mergeCells(`H${r}:I${r}`);
    for(let c=1;c<=9;c++){ const cell=ws.getRow(r).getCell(c); cell.fill=solid(C.ink); cell.font={name:F,size:13,bold:true,color:{argb:C.white}}; cell.alignment={vertical:'middle',indent:c===1?1:0}; }
    ws.getRow(r).height=28; const phRow=r; r++;
    const hdr=['Durum','Adım','Sorumlu','Başlangıç','Bitiş','Plan bütçe','Harcanan','Kalan','Not'];
    hdr.forEach((h,c)=>{ const cell=ws.getRow(r).getCell(c+1); cell.value=h; cell.font={name:F,size:9,bold:true,color:{argb:C.mut}}; cell.fill=solid(C.soft); cell.alignment={vertical:'middle',horizontal:c>=5&&c<=7?'right':'left'}; });
    r++; const s0=r;
    p.steps.forEach(x=>{
      const row=ws.getRow(r);
      row.values=[LBL[x.st]||x.st, x.t, x.who, dt(x.s), dt(x.e), n(x.plan), n(x.act), null, x.note];
      row.getCell(8).value={formula:`IF(AND(F${r}="",G${r}=""),"",N(F${r})-N(G${r}))`};
      row.eachCell({includeEmpty:true},(cell,c)=>{ if(c>9) return; cell.font={name:F,size:10,color:{argb:C.ink},bold:c===2};
        cell.alignment={vertical:'top',wrapText:c===2||c===9,horizontal:c===1?'center':(c>=6&&c<=8?'right':'left')};
        cell.border={bottom:{style:'thin',color:{argb:C.line}}}; });
      row.getCell(4).numFmt=row.getCell(5).numFmt='dd.mm.yyyy';
      [6,7,8].forEach(c=>row.getCell(c).numFmt=money);
      row.height=Math.max(20,14*Math.max(Math.ceil((x.t||'').length/60),Math.ceil((x.note||'').length/48),1)+6);
      row.getCell(1).dataValidation={type:'list',allowBlank:false,formulae:['"Bekliyor,Devam,Bitti,Engel var"'],showErrorMessage:true,errorTitle:'Durum',error:'Listeden seçin: Bekliyor, Devam, Bitti, Engel var'};
      r++;
    });
    const s1=Math.max(s0,r-1);
    const prog=p.steps.length?`(COUNTIF(A${s0}:A${s1},"Bitti")+0.5*COUNTIF(A${s0}:A${s1},"Devam")+0.25*COUNTIF(A${s0}:A${s1},"Engel var"))/${p.steps.length}`:'0';
    const hc=ws.getCell(`H${phRow}`); hc.value={formula:`"İlerleme  "&TEXT(${prog},"0%")`}; hc.alignment={vertical:'middle',horizontal:'right',indent:1}; hc.font={name:F,size:13,bold:true,color:{argb:C.acc}};
    const tr=ws.getRow(r); tr.getCell(2).value='Aşama toplamı'; 
    [6,7,8].forEach((c,k)=>{ const L='FGH'[k]; tr.getCell(c).value=p.steps.length?{formula:`SUM(${L}${s0}:${L}${s1})`}:0; tr.getCell(c).numFmt=money; });
    tr.eachCell({includeEmpty:true},(cell,c)=>{ if(c>9) return; cell.font={name:F,size:10,bold:true,color:{argb:C.mut}}; cell.alignment={horizontal:c>=6&&c<=8?'right':'left'}; });
    ranges.push({name:p.name,s0,s1,cnt:p.steps.length,tot:r});
    r+=2;
  });
  const last=r;
  // status colours and overdue as conditional formats, so they follow edits made in Excel
  const fillRule=(txt,bg,fg,bold)=>({type:'expression',formulae:[`$A${first}="${txt}"`],style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:bg}},font:{color:{argb:fg},bold:!!bold}}});
  ws.addConditionalFormatting({ref:`A${first}:A${last}`,rules:[fillRule('Bitti',C.ink,C.white,1),fillRule('Devam',C.acc,C.ink,1),fillRule('Engel var','FFFFE9E3',C.accInk,1),fillRule('Bekliyor',C.soft,C.ink)]});
  ws.addConditionalFormatting({ref:`B${first}:B${last}`,rules:[{type:'expression',formulae:[`$A${first}="Bitti"`],style:{font:{strike:true,color:{argb:C.mut}}}}]});
  ws.addConditionalFormatting({ref:`E${first}:E${last}`,rules:[{type:'expression',formulae:[`AND(ISNUMBER($E${first}),$E${first}<TODAY(),$A${first}<>"Bitti",$A${first}<>"Durum")`],style:{font:{color:{argb:C.accInk},bold:true}}}]});
  // KPI strip
  const all=`A${first}:A${last}`, total=ranges.reduce((a,x)=>a+x.cnt,0)||1;
  const kp=[['Genel ilerleme',`(COUNTIF(${all},"Bitti")+0.5*COUNTIF(${all},"Devam")+0.25*COUNTIF(${all},"Engel var"))/${total}`,'0%'],
    ['Biten adım',`COUNTIF(${all},"Bitti")&" / ${total}"`,'@'],
    ['Engel var',`COUNTIF(${all},"Engel var")`,'0'],
    ['Planlanan bütçe',ranges.map(x=>`F${x.tot}`).join('+')||'0',money],
    ['Harcanan',ranges.map(x=>`G${x.tot}`).join('+')||'0',money]];
  const kc=['A','B','C','F','H'];
  ws.mergeCells('F4:G4'); ws.mergeCells('F5:G5'); ws.mergeCells('H4:I4'); ws.mergeCells('H5:I5');
  kp.forEach(([l,f,fmt],k)=>{ const a=ws.getCell(kc[k]+'4'); a.value=l; a.font={name:F,size:9,color:{argb:C.mut}}; if(k>=3) a.alignment={horizontal:'left'};
    const b=ws.getCell(kc[k]+'5'); b.value={formula:f}; b.numFmt=fmt; b.font={name:F,size:18,bold:true,color:{argb:k===0?C.acc:C.ink}}; b.alignment={horizontal:'left'}; });
  ws.getRow(5).height=28;
  // summary sheet
  const sm=wb.addWorksheet('Özet',{views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  sm.columns=[{width:6},{width:44},{width:10},{width:10},{width:10},{width:10},{width:12},{width:16},{width:16}];
  sm.mergeCells('A1:I1'); sm.getCell('A1').value=(S.title||'Origin')+' · Aşama özeti'; sm.getCell('A1').font={name:F,size:18,bold:true}; sm.getRow(1).height=30;
  const H=['#','Aşama','Adım','Bitti','Devam','Engel','İlerleme','Plan bütçe','Harcanan'];
  H.forEach((h,c)=>{ const cell=sm.getRow(3).getCell(c+1); cell.value=h; cell.font={name:F,size:9,bold:true,color:{argb:C.white}}; cell.fill=solid(C.ink); cell.alignment={horizontal:c>=2?'right':'left',vertical:'middle'}; });
  sm.getRow(3).height=22;
  ranges.forEach((x,i)=>{ const rr=4+i, row=sm.getRow(rr), R=`Takip!A${x.s0}:A${x.s1}`;
    row.values=[i+1,x.name,x.cnt];
    row.getCell(4).value=x.cnt?{formula:`COUNTIF(${R},"Bitti")`}:0;
    row.getCell(5).value=x.cnt?{formula:`COUNTIF(${R},"Devam")`}:0;
    row.getCell(6).value=x.cnt?{formula:`COUNTIF(${R},"Engel var")`}:0;
    row.getCell(7).value=x.cnt?{formula:`(D${rr}+0.5*E${rr}+0.25*F${rr})/C${rr}`}:0; row.getCell(7).numFmt='0%';
    row.getCell(8).value={formula:`Takip!F${x.tot}`}; row.getCell(9).value={formula:`Takip!G${x.tot}`};
    row.getCell(8).numFmt=row.getCell(9).numFmt=money;
    row.eachCell({includeEmpty:true},(cell,c)=>{ if(c>9) return; cell.font={name:F,size:10,bold:c===2||c===7,color:{argb:c===7?C.accInk:C.ink}}; cell.border={bottom:{style:'thin',color:{argb:C.line}}}; cell.alignment={horizontal:c>=3?'right':'left',vertical:'middle'}; });
    row.height=20; });
  const e=3+ranges.length;
  if(ranges.length) sm.addConditionalFormatting({ref:`G4:G${e}`,rules:[{type:'dataBar',minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'num',value:1}],color:{argb:C.acc},gradient:false}]});
  // toplantılar
  const ms=(S.meetings||[]).slice().sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  if(ms.length){
    const mt=wb.addWorksheet('Toplantılar',{views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
    mt.columns=[{width:13},{width:9},{width:9},{width:40},{width:24},{width:36},{width:30},{width:44}];
    const MH=['Tarih','Başlangıç','Bitiş','Başlık','Yer','Katılımcılar','Aşama','Not'];
    MH.forEach((h,c)=>{ const cell=mt.getRow(1).getCell(c+1); cell.value=h; cell.font={name:F,size:9,bold:true,color:{argb:C.white}}; cell.fill=solid(C.ink); });
    const adlar={}; S.phases.forEach(p=>adlar[p.id]=p.name);
    ms.forEach((m,i)=>{ const row=mt.getRow(i+2); row.values=[dt(m.date),m.start||'',m.end||'',m.title||'',m.place||'',m.who||'',adlar[m.phase]||'',m.note||''];
      row.getCell(1).numFmt='dd.mm.yyyy'; row.eachCell({includeEmpty:true},(cell,c)=>{ if(c>8) return; cell.font={name:F,size:10,bold:c===4}; cell.alignment={vertical:'top',wrapText:c===4||c===8}; cell.border={bottom:{style:'thin',color:{argb:C.line}}}; }); });
  }
  return wb;
}
window.buildWorkbook = buildWorkbook;
