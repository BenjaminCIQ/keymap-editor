import Modal from "../../Common/Modal"
import DialogBox from "../../Common/DialogBox"

export default function InvalidRepo(props) {
  const { onDismiss, otherRepoOrBranchAvailable = false } = props

  return (
    <Modal>
      <DialogBox onDismiss={onDismiss}>
        <h2>Hold up a second!</h2>
        <p>
          The selected repository does not contain <code>info.json</code> or
          <code>keymap.json</code>.
        </p>
        <p>
          This app depends on some additional metadata to render the keymap.
          Add the required metadata to your keyboard repo, then try loading it
          again.
        </p>
        {otherRepoOrBranchAvailable && (
          <p>
            If you have another branch or repository the the required metadata
            files you may switch to them instead.
          </p>
        )}
      </DialogBox>
    </Modal>
  )
}
