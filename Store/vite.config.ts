import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PluginOption } from 'vite';

function reactVirtualized(): PluginOption {
  const WRONG_CODE = `import { bpfrpt_proptype_WindowScroller } from "../WindowScroller.js";`;

  return {
    name: 'my:react-virtualized',
    async configResolved() {
      const reactVirtualizedPath = path.dirname(
        fileURLToPath(import.meta.resolve('react-virtualized'))
      );

      const brokenFilePath = path.join(
        reactVirtualizedPath,
        '..', // back to dist
        'es',
        'WindowScroller',
        'utils',
        'onScroll.js'
      );
      const brokenCode = await readFile(brokenFilePath, 'utf-8');

      const fixedCode = brokenCode.replace(WRONG_CODE, '');
      await writeFile(brokenFilePath, fixedCode);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), 
    reactVirtualized(),
  ],
})
