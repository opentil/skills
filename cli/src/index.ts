import { install } from './commands/install.js';
import { update } from './commands/update.js';
import { uninstall } from './commands/uninstall.js';
import { doctor } from './commands/doctor.js';

const command = process.argv[2];

switch (command) {
  case 'update':
    update();
    break;
  case 'uninstall':
    uninstall();
    break;
  case 'doctor':
    doctor();
    break;
  default:
    install();
    break;
}
