'use client';

import Spline from '@splinetool/react-spline';
import type { Application } from '@splinetool/runtime';

const SCENE_URL = 'https://prod.spline.design/psYASiOaXl5EbuAn/scene.splinecode';

/**
 * The published scene ships Spline's "Built with Spline" badge as an image
 * that the runtime draws on top of the canvas via a watermark overlay pass.
 * There is no public option to disable it, so turn the overlay off on the
 * renderer pipeline once the scene has finished loading.
 */
function removeSplineBadge(app: Application) {
  const pipeline = (
    app as unknown as {
      _renderer?: { pipeline?: { setWatermark?: (texture: unknown) => void } };
    }
  )._renderer?.pipeline;

  if (!pipeline?.setWatermark) return;

  pipeline.setWatermark(null);
  app.requestRender();
}

export default function SplineScene() {
  return (
    <Spline
      scene={SCENE_URL}
      className="absolute inset-0 w-full h-full"
      onLoad={removeSplineBadge}
    />
  );
}
