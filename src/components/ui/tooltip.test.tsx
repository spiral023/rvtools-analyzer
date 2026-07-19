import { render, screen } from "@testing-library/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("TooltipContent", () => {
  it("renders open tooltip content in a document portal", async () => {
    const { container } = render(
      <TooltipProvider delayDuration={0}>
        <Tooltip defaultOpen>
          <TooltipTrigger>Mehr Informationen</TooltipTrigger>
          <TooltipContent>Erklärung</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const description = await screen.findByRole("tooltip");
    const popper = description.closest("[data-radix-popper-content-wrapper]") as HTMLElement | null;

    expect(popper).not.toBeNull();
    expect(container).not.toContainElement(popper);
    expect(document.body).toContainElement(popper);
  });
});
