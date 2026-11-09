// GET  /api/tasks?list=ID[&assignee=email]   or   ?email=you@gmail.com
// POST /api/tasks  { text, list, assignee?, createdBy? }   or   { text, email }
const { handler, listTasks, addTask } = require("../lib/bitb");

module.exports = handler({
  GET: q => listTasks(q),
  POST: (q, body) => addTask(body),
});
