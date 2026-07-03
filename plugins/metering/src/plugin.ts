import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { MeteringCardContent } from './components/MeteringCard';

// Named export used as importName in dynamic-plugins.yaml pluginConfig
export { MeteringCardContent as MeteringCard };

export default createFrontendPlugin({
  pluginId: 'metering',
  extensions: [],
});
