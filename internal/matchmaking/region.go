package matchmaking

// GlobalMatchmakingRegion is the no-preference region. Global stacks can fill
// one explicit regional lobby, but never bridge two explicit regions.
const GlobalMatchmakingRegion int32 = 0

// QueueRegionsCompatible reports whether a waiting stack may participate in a
// match targeting matchmakingRegion. Global stacks can fill any one explicit
// region, while a global target includes only global stacks.
func QueueRegionsCompatible(matchmakingRegion, stackRegion int32) bool {
	if matchmakingRegion == GlobalMatchmakingRegion {
		return stackRegion == GlobalMatchmakingRegion
	}
	return stackRegion == GlobalMatchmakingRegion || stackRegion == matchmakingRegion
}
