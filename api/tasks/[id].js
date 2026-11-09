// PATCH  /api/tasks/TASK_ID  { list | email, done?, text?, doneBy? }
// DELETE /api/tasks/TASK_ID?list=ID   or   ?email=you@gmail.com
const { handler, updateTask, deleteTask } = require("../../lib/bitb");

module.exports = handler({
  PATCH: (q, body) => updateTask(q.id, body),
  DELETE: (q, body) => deleteTask(q.id, { ...q, ...body }),
});
