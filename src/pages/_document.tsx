import BaseDocument, {
  type DocumentContext,
  type DocumentInitialProps,
  Head,
  Html,
  Main,
  NextScript,
} from 'next/document'

interface DocumentProps extends DocumentInitialProps {
  nonce?: string
}

export default function Document({ nonce }: DocumentProps) {
  return (
    <Html lang="en">
      <Head nonce={nonce}>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#168bc5" />
        <meta name="application-name" content="AniList Bulk Edit" />
      </Head>
      <body>
        <Main />
        <NextScript nonce={nonce} />
      </body>
    </Html>
  )
}

Document.getInitialProps = async (
  context: DocumentContext,
): Promise<DocumentProps> => {
  const initialProps = await BaseDocument.getInitialProps(context)
  const requestNonce = context.req?.headers['x-nonce']
  const nonce = Array.isArray(requestNonce) ? requestNonce[0] : requestNonce
  return { ...initialProps, ...(nonce ? { nonce } : {}) }
}
