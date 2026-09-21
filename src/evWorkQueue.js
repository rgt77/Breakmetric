// BreakMetric EV work-queue helpers v1.
(function(root){
  "use strict";
  const api={};
  const categories=new Set(["base_parallels","inserts","autographs"]);
  const statuses=new Set(["not-started","partial","complete"]);

  api.validate=function(data={},canonicalTeams=[]){
    const errors=[];
    if(data.schema_version!==1) errors.push("EV work queue schema mismatch");
    if(data.model!=="ev-work-queue-v1") errors.push("EV work queue model mismatch");
    if(!Array.isArray(data.tasks)) errors.push("EV work queue tasks missing");
    const teamSet=new Set(canonicalTeams);
    const ids=new Set();
    for(const task of data.tasks||[]){
      if(!teamSet.has(task.team)) errors.push("EV work queue unknown team: "+task.team);
      if(!categories.has(task.category)) errors.push("EV work queue invalid category: "+task.category);
      if(!statuses.has(task.status)) errors.push("EV work queue invalid status: "+task.id);
      if(!Number.isInteger(Number(task.priority)) || Number(task.priority)<1) errors.push("EV work queue invalid priority: "+task.id);
      if(!Number.isFinite(Number(task.valued_contribution_count)) || Number(task.valued_contribution_count)<0) errors.push("EV work queue invalid valued count: "+task.id);
      if(ids.has(task.id)) errors.push("EV work queue duplicate id: "+task.id);
      ids.add(task.id);
    }
    if((data.tasks||[]).length!==canonicalTeams.length*3) errors.push("EV work queue task count mismatch");
    return {valid:errors.length===0,errors};
  };

  api.teamTasks=function(data={},team){
    return (data.tasks||[]).filter(row=>row.team===team)
      .sort((a,b)=>a.priority-b.priority || a.category.localeCompare(b.category));
  };

  api.nextTask=function(data={},team=null){
    const rows=(data.tasks||[]).filter(row=>row.status!=="complete" && (!team || row.team===team));
    return rows.sort((a,b)=>a.priority-b.priority || b.valued_contribution_count-a.valued_contribution_count || a.team.localeCompare(b.team))[0]||null;
  };

  api.summary=function(data={}){
    const tasks=data.tasks||[];
    return {
      total:tasks.length,
      complete:tasks.filter(x=>x.status==="complete").length,
      partial:tasks.filter(x=>x.status==="partial").length,
      not_started:tasks.filter(x=>x.status==="not-started").length,
      teams_in_progress:new Set(tasks.filter(x=>x.status==="partial").map(x=>x.team)).size
    };
  };

  api.label=function(task){
    if(!task) return "No pending EV work";
    const name={base_parallels:"Base parallels",inserts:"Inserts",autographs:"Autographs"}[task.category]||task.category;
    return name+" · "+task.status+" · priority "+task.priority;
  };

  root.BreakMetricEvWorkQueue=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
