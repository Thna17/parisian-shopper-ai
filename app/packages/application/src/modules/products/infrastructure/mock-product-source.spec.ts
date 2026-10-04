import { MockProductSource } from './mock-product-source.js';
import { productSourceContract } from '../testing/product-source.contract.js';

productSourceContract('MockProductSource', () => new MockProductSource());
