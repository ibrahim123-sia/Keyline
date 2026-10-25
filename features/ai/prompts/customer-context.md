<!--
Per-turn context for the customer assistant, sent at the start of the visitor's turn (not in
the cached system prompt). Variables: today, officeStatus, pageContext
-->

<context>
Today: {{today}}
Office: {{officeStatus}}
The visitor is looking at: {{pageContext}}
</context>
