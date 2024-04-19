import { Flex } from "@chakra-ui/react";

export function EmptyState() {
  return (
    <div className="rounded flex flex-col items-center max-w-full md:p-8">
      <Flex
        marginTop={"25px"}
        grow={1}
        maxWidth={"800px"}
        width={"100%"}
      ></Flex>
      <Flex
        marginTop={"25px"}
        grow={1}
        maxWidth={"800px"}
        width={"100%"}
      ></Flex>
    </div>
  );
}
