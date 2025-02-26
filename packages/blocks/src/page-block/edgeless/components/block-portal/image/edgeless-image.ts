import { customElement } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import type { ImageBlockModel } from '../../../../../image-block/index.js';
import { Bound } from '../../../../../surface-block/index.js';
import { EdgelessPortalBase } from '../edgeless-portal-base.js';

@customElement('edgeless-block-portal-image')
export class EdgelessBlockPortalImage extends EdgelessPortalBase<ImageBlockModel> {
  override render() {
    const { model, surface, index } = this;
    const bound = Bound.deserialize(model.xywh);
    const style = {
      position: 'absolute',
      zIndex: `${index}`,
      width: `${bound.w}px`,
      height: `${bound.h}px`,
      transform: `translate(${bound.x}px, ${bound.y}px)`,
    };

    return html`
      <div style=${styleMap(style)}>${surface.edgeless.renderModel(model)}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-block-portal-image': EdgelessBlockPortalImage;
  }
}
