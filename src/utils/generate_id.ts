import { customAlphabet } from 'nanoid';

export default function generateId(size = 16) {
  const urlAlphabet =
    'useandom26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
  const nanoid = customAlphabet(urlAlphabet, size);
  return nanoid();
}
