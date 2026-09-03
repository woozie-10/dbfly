import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeSwitcher } from "@/components/playground/theme-switcher";

// Mock next-themes
const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeSwitcher", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
  });

  it("renders the theme toggle button", () => {
    render(<ThemeSwitcher />);
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
  });

  it("opens dropdown on click and shows options", async () => {
    render(<ThemeSwitcher />);
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /light/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("menuitem", { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /system/i })).toBeInTheDocument();
  });

  it("calls setTheme with light", async () => {
    render(<ThemeSwitcher />);
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /light/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("menuitem", { name: /light/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("calls setTheme with dark", async () => {
    render(<ThemeSwitcher />);
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /dark/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("menuitem", { name: /dark/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme with system", async () => {
    render(<ThemeSwitcher />);
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /system/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("menuitem", { name: /system/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });
});
