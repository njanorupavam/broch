const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('app.js', 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const context = {
  studentsData: [{
    name: 'ISHAL R S',
    email: 'ishalrs06@gmail.com',
    skills: [],
    keywords: [],
  }],
  messages: [],
  storage: {},
  localStorage: {
    getItem(key) { return context.storage[key] || null; },
    setItem(key, value) { context.storage[key] = String(value); },
    removeItem(key) { delete context.storage[key]; },
  },
  filterData() {},
  refreshStreamFilterOptions() {},
  originalStudentsData: [],
  MANUAL_STUDENTS_KEY: 'manual',
  DELETED_STUDENTS_KEY: 'deleted',
  escapeHtml: value => value,
  addMessage(text, type, status) { context.messages.push({ text, type, status }); },
};

vm.createContext(context);
vm.runInContext([
  section('function normalizeAssistantCommand', '// Fuzzy name matcher'),
  section('function findStudentByName', '// Persist student edits'),
  `function readStoredArray(key) {
    try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
    catch (error) { return []; }
  }
  function studentIdentity(student) { return (student.email || student.name || '').trim().toLowerCase(); }`,
  'function persistStudentEdits() {}',
  section('function processCommand', 'function applyFieldChange'),
].join('\n'), context);

const command = '\'Add a new description "PCB Design & Embedded Systems" "Trained in PCB design, circuit layout, and embedded hardware development through hands-on workshop experience." to "ISHAL R S"\'';
vm.runInContext(`processCommand(${JSON.stringify(command)})`, context);

const added = context.studentsData[0].skills[0];
if (!added ||
    added.title !== 'PCB Design & Embedded Systems' ||
    added.description !== 'Trained in PCB design, circuit layout, and embedded hardware development through hands-on workshop experience.') {
  throw new Error(`Assistant command failed: ${JSON.stringify({ added, messages: context.messages })}`);
}

console.log('Assistant command passed:', added);

context.studentsData[0].skills.push({ title: 'FPGA Design', description: '' });
vm.runInContext(`processCommand(${JSON.stringify('Add skill FPGA Design to ISHAL R S')})`, context);
if (!context.studentsData[0].keywords.includes('FPGA Design') ||
    context.studentsData[0].skills.some(skill => skill.title === 'FPGA Design' && !skill.description)) {
  throw new Error(`Skill badge command failed: ${JSON.stringify(context.studentsData[0])}`);
}

console.log('Skill badge command passed:', context.studentsData[0].keywords);

context.storage.deleted = JSON.stringify(['kaasinaathanmp@gmail.com', 'keep@example.com']);
vm.runInContext(`
  ${section('function restoreImportedStudentDeletions', 'function updateFrontPageName')}
  restoreImportedStudentDeletions([{ name: 'KAASINAATHAN MP', email: 'kaasinaathanmp@gmail.com' }]);
`, context);
const remainingDeletions = JSON.parse(context.storage.deleted);
if (remainingDeletions.includes('kaasinaathanmp@gmail.com') || !remainingDeletions.includes('keep@example.com')) {
  throw new Error(`Import deletion restore failed: ${context.storage.deleted}`);
}

console.log('Imported student deletion restore passed:', remainingDeletions);
