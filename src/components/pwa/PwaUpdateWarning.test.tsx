import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRegisterSW } from "virtual:pwa-register/react";
import { PwaUpdateWarning } from "@/components/pwa/PwaUpdateWarning";

vi.mock("virtual:pwa-register/react", () => ({ useRegisterSW: vi.fn() }));

const mockedUseRegisterSW = vi.mocked(useRegisterSW);

describe("PwaUpdateWarning", () => {
  it("rendert nichts ohne ausstehendes Update", () => {
    mockedUseRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    const { container } = render(<PwaUpdateWarning />);

    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt eine klickbare Warnung, wenn ein Update aussteht", () => {
    const updateServiceWorker = vi.fn();
    mockedUseRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    });

    render(<PwaUpdateWarning />);
    const button = screen.getByRole("button", { name: /neue version laden/i });
    fireEvent.click(button);

    expect(button).toBeInTheDocument();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
