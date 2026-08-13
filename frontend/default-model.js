/* BeamLab default example: a cantilever carrying a full-span UDL. */
(()=>{
  const defaultModel={
    spans:[{length:4,E:200,I:100000000}],
    supports:[{id:1,type:'fixed',position:0,settlement:0}],
    loads:[{id:1,type:'udl',value:8,value2:8,position:0,to:4}]
  };
  state=clone(defaultModel);
  lastResult=null;
  render();
  clearResults();
})();
