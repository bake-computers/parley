# OVI matchmaking model

The engine downloads `ovi_model.onnx` from the private R2 `ovi` bucket at
startup. It accepts only the current six-input ONNX `LinearRegressor` contract
and logs the loaded object's ETag and SHA-256. Restart the engine to adopt a
new object.

The model score is used to form teams. It is not a calibrated team-vs-team win
probability. Existing `cpr`, `balance_rating`, and `expected_lobby_cpr` fields
remain compatibility names and contain clamped model scores.

The current artifact was trained on 75,500 rows. Evaluation against its frozen
72,000-row corpus measured AUC 0.6277 and MSE 0.2363, compared with a 0.2498
constant-score MSE and 0.2435 season-win-rate MSE. These are training-corpus
measurements, not an independent production-quality estimate.

Players need a fresh stats snapshot with at least three current-season ranked
matches and the extended per-match rollup telemetry. Older snapshots cannot be
scored and must be refreshed.

The partition objective is:

```text
abs(team sum clamped model scores)
+ 0.10 * role mix total-variation distance
+ 0.05 * mean team role-silo penalty
```

`BalanceGap` uses that same sum difference so it matches `team_a_balance_total`
minus `team_b_balance_total`.

`MATCHMAKING_ROLE_BALANCE_WEIGHT` and
`MATCHMAKING_ROLE_COLLISION_WEIGHT` override the two weights. See
`.env.example` for required R2 configuration.
