import { install } from './commands/install.js';
import { update } from './commands/update.js';
import { uninstall } from './commands/uninstall.js';
import { doctor } from './commands/doctor.js';
import { detect } from './commands/detect.js';
import { image } from './commands/image.js';
import { parseFlags, enableJsonMode } from './json-mode.js';

const flags = parseFlags(process.argv);

if (flags.json) {
  enableJsonMode();
}

switch (flags.command) {
  case 'update':
    update(flags);
    break;
  case 'uninstall':
    uninstall(flags);
    break;
  case 'doctor':
    doctor(flags);
    break;
  case 'detect':
    detect(flags);
    break;
  case 'image':
    image(flags);
    break;
  default:
    install(flags);
    break;
}
