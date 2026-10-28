/**
 * The reference table of the domains. The build makes it from the domain objects, so the table and the code
 * cannot differ.
 */
import type { AnyDomain, Law, ParamKind } from "@mark1russell7/vex";
import { AngleDomain, BoolDomain, ColorDomain, DateDomain, FnDomain, JsonDomain, LiftedNDVectorDomain, MaybeDomain, NDVectorDomain, NumDomain, NumRecordDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import type { ReactElement } from "react";

const ALL: readonly AnyDomain[] = [Vec2Domain, NDVectorDomain, LiftedNDVectorDomain, NumRecordDomain, ColorDomain, AngleDomain, DateDomain, NumDomain, BoolDomain, TextDomain, FnDomain, MaybeDomain, JsonDomain];

interface OpRow {
  readonly fn?: unknown;
  readonly laws?: readonly Law[];
  readonly identity?: unknown;
  readonly liftScalar?: boolean | readonly boolean[];
  readonly params?: readonly ParamKind[];
}

/** The table of one domain, or of each domain. */
export default function DomainTable(props: { readonly name?: string }): ReactElement {
  const domains = props.name === undefined ? ALL : ALL.filter((d) => d.name === props.name);
  return (
    <>
      {domains.map((d) => (
        <section key={d.name} className="vx-frame" aria-label={`The domain ${d.name}`}>
          <header>
            <strong>{d.name}</strong>
            <span className="vx-muted">
              {Object.keys(d.ops).length} ops{d.fromScalar === undefined ? "" : " · fromScalar"}{d.valid === undefined ? "" : " · valid"}{d.encode === undefined ? "" : " · encode/decode"}{d.methods === "all" ? " · methods: all" : ""}
            </span>
          </header>
          <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label={`The ops of ${d.name}`}>
            <table className="vx-table" style={{ display: "table" }}>
              <thead>
                <tr>
                  <th scope="col">op</th>
                  <th scope="col">parameters</th>
                  <th scope="col">laws</th>
                  <th scope="col">lifts numbers</th>
                  <th scope="col">identity</th>
                  <th scope="col">implementation</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(d.ops as Readonly<Record<string, OpRow>>).map(([name, op]) => (
                  <tr key={name}>
                    <td>
                      <code>{name}</code>
                    </td>
                    <td>{op.params === undefined ? <span className="vx-muted">not checked</span> : op.params.length === 0 ? "none" : op.params.join(", ")}</td>
                    <td>{(op.laws ?? []).join(", ")}</td>
                    <td>{op.liftScalar === true ? "yes" : Array.isArray(op.liftScalar) ? "some" : ""}</td>
                    <td>{op.identity === undefined ? "" : "yes"}</td>
                    <td className="vx-muted">{op.fn === undefined ? "method" : "fn"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
