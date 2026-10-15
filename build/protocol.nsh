; Windows per-user URL handler. Never register a development or staging path.
!macro ConcordRegisterProtocol registryKey executable
  WriteRegStr HKCU "${registryKey}" "" "URL:Convite do Concord"
  WriteRegStr HKCU "${registryKey}" "URL Protocol" ""
  WriteRegStr HKCU "${registryKey}\DefaultIcon" "" '"${executable}",0'
  WriteRegStr HKCU "${registryKey}\shell\open\command" "" '"${executable}" "%1"'
!macroend

!macro ConcordUnregisterProtocol registryKey executable
  ReadRegStr $0 HKCU "${registryKey}\shell\open\command" ""
  ${If} $0 == '"${executable}" "%1"'
    DeleteRegKey HKCU "${registryKey}"
  ${EndIf}
!macroend
