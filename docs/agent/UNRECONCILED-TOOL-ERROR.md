# Unreconciled tool result taxonomy

ToolUnreconciledError marks callback-completed output withheld after registered tool/current grant changed. Converts to fixed-text internal/tool-unreconciled, retryable=false, even if timeout/abort metadata is also present. Panel description says a proposal/completed change may still exist, review document/receipts before retrying. It must not claim no changes or safe retry. No private callback output/raw errors included.

Registry uses this typed error for late spec/grant drift. Requires same post-await guard as late-output patchace8691ef; replace its generic throw with typed throw rather than duplicate check. Other existing error taxonomy unchanged. Tests classification and real paused registry unregister. No visual UI layout, dependencies/cloud/spending or execution scope change.
