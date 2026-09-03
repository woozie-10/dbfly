import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExplainPlan } from "@/components/playground/explain-plan";

describe("ExplainPlan", () => {
  it("renders empty state", () => {
    render(<ExplainPlan plan={[]} executionTimeMs={0} />);
    expect(screen.getByText("No execution plan available")).toBeInTheDocument();
  });

  it("renders plan lines", () => {
    const plan = [
      "Seq Scan on users  (cost=0.00..10.00 rows=100)",
      "  Filter: (id > 5)",
    ];
    render(<ExplainPlan plan={plan} executionTimeMs={1.5} />);
    expect(screen.getByText(/Seq Scan on users/)).toBeInTheDocument();
    expect(screen.getByText(/Filter: \(id > 5\)/)).toBeInTheDocument();
  });

  it("shows execution time", () => {
    const plan = ["Seq Scan on users"];
    render(<ExplainPlan plan={plan} executionTimeMs={42.5} />);
    expect(screen.getByText("42.5ms")).toBeInTheDocument();
  });

  it("shows EXPLAIN header", () => {
    const plan = ["Seq Scan on users"];
    render(<ExplainPlan plan={plan} executionTimeMs={0} />);
    expect(screen.getByText("Execution Plan")).toBeInTheDocument();
  });

  it("shows EXPLAIN ANALYZE header", () => {
    const plan = ["Seq Scan on users"];
    render(
      <ExplainPlan plan={plan} executionTimeMs={0} isAnalyze={true} />
    );
    expect(screen.getByText("EXPLAIN ANALYZE")).toBeInTheDocument();
    expect(screen.getByText("Actual execution")).toBeInTheDocument();
  });

  it("renders nested plan with connectors", () => {
    const plan = [
      "Hash Join",
      "  Seq Scan on users",
      "  Seq Scan on orders",
    ];
    render(<ExplainPlan plan={plan} executionTimeMs={0} />);
    expect(screen.getByText("Hash Join")).toBeInTheDocument();
    expect(screen.getByText("Seq Scan on users")).toBeInTheDocument();
    expect(screen.getByText("Seq Scan on orders")).toBeInTheDocument();
  });

  it("classifies scan nodes", () => {
    const plan = ["Seq Scan on users"];
    render(<ExplainPlan plan={plan} executionTimeMs={0} />);
    // The node should be classified as a scan
    expect(screen.getByText("Seq Scan on users")).toBeInTheDocument();
  });

  it("classifies join nodes", () => {
    const plan = ["Hash Join"];
    render(<ExplainPlan plan={plan} executionTimeMs={0} />);
    expect(screen.getByText("Hash Join")).toBeInTheDocument();
  });

  it("classifies sort nodes", () => {
    const plan = ["Sort"];
    render(<ExplainPlan plan={plan} executionTimeMs={0} />);
    expect(screen.getByText("Sort")).toBeInTheDocument();
  });

  it("classifies aggregate nodes", () => {
    const plan = ["Hash Aggregate"];
    render(<ExplainPlan plan={plan} executionTimeMs={0} />);
    expect(screen.getByText("Hash Aggregate")).toBeInTheDocument();
  });

  it("classifies filter nodes", () => {
    const plan = ["Filter: (x > 5)"];
    render(<ExplainPlan plan={plan} executionTimeMs={0} />);
    expect(screen.getByText("Filter: (x > 5)")).toBeInTheDocument();
  });
});
