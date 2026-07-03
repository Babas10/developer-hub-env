import {
  createFrontendPlugin,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';
import { meteringApiFactory } from './api';
import { MeteringCardContent } from './components/MeteringCard';

// Named export used as importName in dynamic-plugins.yaml pluginConfig
export { MeteringCardContent as MeteringCard };

const MeteringApiBlueprint = ApiBlueprint.make({
  name: 'metering-api',
  params: defineParams => defineParams(meteringApiFactory),
});

export default createFrontendPlugin({
  pluginId: 'metering',
  extensions: [MeteringApiBlueprint],
});
