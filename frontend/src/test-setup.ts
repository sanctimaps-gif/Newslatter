import '@testing-library/jest-dom/vitest'; // types des assertions DOM
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';

expect.extend(matchers);
