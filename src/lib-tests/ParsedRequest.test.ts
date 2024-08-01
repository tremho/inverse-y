
import Tap from "tap"
function test(t:Tap.Tap) {
    t.ok(true, 'Sanity test passes')

    t.end()

}
Tap.test('Parsed Request Test', (t:any)=> {
    test(t)
})
