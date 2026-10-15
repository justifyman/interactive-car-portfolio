import { Terrain } from './TerrainMesh';
import { Roads } from './RoadMesh';
import { Water } from './Water';
import { Town } from './Town';
import { NorthWall } from './NorthWall';
import { Signs } from './Signs';
import { ProjectStands } from './ProjectStands';
import { Zones } from './Zones';
import { Life } from './Life';

export function World() {
  return (
    <>
      <Terrain />
      <Water />
      <Roads />
      <NorthWall />
      <Town />
      <Signs />
      <ProjectStands />
      <Zones />
      <Life />
    </>
  );
}
