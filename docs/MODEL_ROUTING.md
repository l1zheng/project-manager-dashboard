# Model Routing Agreement

## Purpose

Use the least expensive model tier that can complete the current task reliably. Increase capability for decisions with wide impact or high uncertainty; reduce capability for bounded implementation that follows an accepted design.

The assistant must proactively tell the user when the current or next task would be better handled by another tier. The user performs the actual model switch in the client. Do not silently assume that a switch occurred.

## Tiers

### Tier H — High model, high reasoning

Use for work where a wrong decision would propagate broadly or be expensive to reverse:

- Product architecture and major architecture changes.
- Data model design, migrations, backup/recovery strategy, and compatibility decisions.
- Security boundaries, input sanitization, local-process execution, and Outlook automation safety.
- Excel layout algorithms and difficult cross-format rendering decisions.
- Ambiguous requirements that change product scope.
- Difficult root-cause analysis after normal debugging has failed.
- Release-readiness, packaging, upgrade, and disaster-recovery reviews.
- Final review of large or high-risk changes before release.

Expected output: explicit trade-offs, alternatives, risks, and a recorded decision.

### Tier M — Medium model, medium reasoning

Default tier for normal production development:

- Implementing a feature from an accepted architecture and clear acceptance criteria.
- React components, Fastify routes, SQLite repositories, and ordinary validation.
- Unit and integration tests.
- Moderate refactors with bounded scope.
- Code review for ordinary changes.
- Debugging failures with clear reproduction steps.
- Connecting previously designed modules.
- Updating project documentation after implementation.

Expected output: complete implementation, proportional tests, and concise status updates.

### Tier S — Mini model, medium reasoning

Use for mechanical, repetitive, or tightly specified work:

- Copy changes and documentation formatting.
- Small CSS adjustments after the visual direction is fixed.
- Adding straightforward fields, fixtures, and test cases that follow existing patterns.
- Renaming symbols or files with an established migration path.
- Simple CRUD endpoints after one representative endpoint is already complete.
- Dependency metadata and configuration changes with exact instructions.
- Running established checks and reporting results.

Do not use Tier S for schema design, security-sensitive code, destructive migrations, Outlook COM execution, Excel formula protection, or unresolved debugging.

## Routing process

At the start of a meaningful task, evaluate:

1. **Blast radius** — How many modules or future tasks depend on this decision?
2. **Reversibility** — Can a mistake be corrected cheaply without data loss or rework?
3. **Ambiguity** — Are requirements and the implementation pattern already clear?
4. **Risk** — Does the task touch security, external processes, persistence, export correctness, or release safety?
5. **Novelty** — Is this the first implementation of a pattern, or another repetition of an accepted pattern?

Routing guidance:

- High blast radius, low reversibility, high ambiguity/risk, or a novel critical pattern → Tier H.
- Clear feature work with moderate judgment → Tier M.
- Low-risk repetition with a proven pattern → Tier S.

## Switching protocol

When a switch is recommended, the assistant says so before starting the affected work using this format:

> 建议切换到：高模型高推理强度 / 中等模型中等推理强度 / 迷你模型中推理强度  
> 原因：一句话说明任务风险或机械程度。  
> 切换时机：现在 / 完成当前小步骤后。

Rules:

- Do not interrupt a safe, nearly completed step only to change tiers.
- Recommend upgrading before making a high-impact decision, not after it is already made.
- Recommend downgrading when the architecture and representative pattern are stable.
- If several adjacent tasks need different tiers, group them to minimize switching overhead.
- Model tier changes do not change authorization, safety rules, scope, or testing requirements.
- If the user chooses not to switch, continue at the current tier and call out any resulting confidence or efficiency trade-off only when material.

## Project examples

| Task | Recommended tier |
| --- | --- |
| Finalize dynamic record storage and migration strategy | Tier H |
| Scaffold the accepted React/Fastify workspace | Tier M |
| Implement the first filter-expression evaluator | Tier H |
| Add the second and third field-type editors from the established pattern | Tier S |
| Implement Excel base-grid span allocation and edge cases | Tier H |
| Connect the tested layout result to ExcelJS | Tier M |
| Add more workbook fixtures following the established format | Tier S |
| Design Outlook COM security boundary | Tier H |
| Implement the approved PowerShell adapter and tests | Tier M |
| Adjust approved email colors and spacing | Tier S |
