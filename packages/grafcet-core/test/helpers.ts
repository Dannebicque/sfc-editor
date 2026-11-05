import { buildDemoProject, type DemoTexts } from '../src';
import demo from '../../editor/src/demo-texts.json';

export const demoProject = () => buildDemoProject((demo as { fr: DemoTexts }).fr);
