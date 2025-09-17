import { ChatCardImages } from "@loki/ai-image-gen/ui";
import * as imageTools from "@loki/ai-image-gen/tools";

export default ({ components, schemas, tools }) => {
  tools.defineMany({ ...imageTools });
};
